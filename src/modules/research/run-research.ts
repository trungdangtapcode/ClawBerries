import { db, schema } from "@/shared/db/index.js";
import { redis } from "@/shared/redis/index.js";
import { eq } from "drizzle-orm";
import type { DispatchPreviewItem } from "@/modules/parser/dispatcher.js";
import type {
	AgentProgressItem,
	ResearchProgressState,
} from "@/shared/types/research.js";
import { callTinyFish } from "./tinyfish-client.js";

/** 120-second hard timeout for the entire research phase */
const RESEARCH_TIMEOUT_MS = 120_000;

const PROGRESS_KEY = (requestId: string) => `progress:${requestId}`;
const PROGRESS_TTL_SECONDS = 600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateAgentDb(
	rowId: string,
	status: "completed" | "failed" | "timeout",
	result?: Record<string, unknown>,
	errorMessage?: string,
): Promise<void> {
	await db
		.update(schema.agentResults)
		.set({
			status,
			result: result ?? null,
			errorMessage: errorMessage ?? null,
			completedAt: new Date(),
		})
		.where(eq(schema.agentResults.id, rowId));
}

async function updateProgress(
	requestId: string,
	agentIndex: number,
	patch: Partial<AgentProgressItem> & { outcome: "completed" | "failed" | "timeout" },
): Promise<void> {
	const key = PROGRESS_KEY(requestId);
	const raw = await redis.get(key);
	if (!raw) return;

	const state: ResearchProgressState = JSON.parse(raw);

	if (patch.outcome === "completed") state.completed += 1;
	else if (patch.outcome === "failed") state.failed += 1;
	else state.timedOut += 1;

	const agent = state.agents[agentIndex];
	if (agent) {
		agent.status = patch.outcome === "completed" ? "completed"
			: patch.outcome === "failed" ? "failed" : "timeout";
		agent.summary = patch.summary ?? null;
		agent.durationMs = patch.durationMs ?? null;
	}

	await redis.set(key, JSON.stringify(state), "EX", PROGRESS_TTL_SECONDS);
}

// ─── Single-agent runner ──────────────────────────────────────────────────────

/**
 * Runs ONE research agent via TinyFish and writes the result to DB + Redis.
 * Designed to be called concurrently with Promise.allSettled, one call per item.
 */
async function runSingleAgent(
	requestId: string,
	item: DispatchPreviewItem,
	agentIndex: number,
	dbRowId: string,
): Promise<void> {
	const start = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), item.timeout);

	try {
		const { result } = await callTinyFish(
			{
				url: item.targetUrl,
				goal: item.prompt,
				browser_profile: item.browserProfile,
			},
			controller.signal,
		);

		clearTimeout(timer);
		const durationMs = Date.now() - start;

		await updateAgentDb(dbRowId, "completed", result as Record<string, unknown>);
		await updateProgress(requestId, agentIndex, {
			outcome: "completed",
			summary: (result as { summary?: string }).summary ?? null,
			durationMs,
		});
	} catch (err) {
		clearTimeout(timer);
		const durationMs = Date.now() - start;
		const isTimeout = err instanceof Error && err.name === "AbortError";
		const status = isTimeout ? "timeout" : "failed";
		const message = err instanceof Error ? err.message : String(err);

		await updateAgentDb(dbRowId, status, undefined, message);
		await updateProgress(requestId, agentIndex, {
			outcome: status,
			summary: isTimeout ? "timed out" : `failed: ${message}`,
			durationMs,
		});
	}
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Step 5: Parallel Research Execution
 *
 * Fires one callTinyFish per item concurrently (bulk-async pattern).
 * Each item comes from Step 4's previewAgentTargets() output.
 * Results are written to agent_results (Postgres) and progress:{requestId} (Redis).
 *
 * Enforces a 120-second hard timeout across all concurrent calls.
 */
export async function runResearch(
	requestId: string,
	items: DispatchPreviewItem[],
): Promise<void> {
	if (items.length === 0) return;

	// 1. INSERT running rows into agent_results (one per item)
	const insertedRows = await db
		.insert(schema.agentResults)
		.values(
			items.map((item) => ({
				requestId,
				agentType: item.agentType,
				agentTarget: item.target,
				status: "running" as const,
			})),
		)
		.returning({ id: schema.agentResults.id });

	const rowIds = insertedRows.map((r) => r.id);

	// 2. Initialise Redis progress state
	const progressItems: AgentProgressItem[] = items.map((item) => ({
		agentType: item.agentType,
		target: item.target,
		status: "running",
		summary: null,
		durationMs: null,
	}));

	const initialState: ResearchProgressState = {
		total: items.length,
		completed: 0,
		failed: 0,
		timedOut: 0,
		startedAt: Date.now(),
		agents: progressItems,
	};
	await redis.set(
		PROGRESS_KEY(requestId),
		JSON.stringify(initialState),
		"EX",
		PROGRESS_TTL_SECONDS,
	);

	// 3. Update research_requests status → researching
	await db
		.update(schema.researchRequests)
		.set({ status: "researching" })
		.where(eq(schema.researchRequests.id, requestId));

	// 4. Fire all agents concurrently — one callTinyFish per item (bulk-async pattern)
	//    Each call manages its own per-agent AbortController via item.timeout.
	const runAll = Promise.allSettled(
		items.map((item, idx) =>
			runSingleAgent(requestId, item, idx, rowIds[idx] as string),
		),
	);

	// Hard 120-second deadline across ALL agents
	const globalTimeout = new Promise<void>((resolve) =>
		setTimeout(() => resolve(), RESEARCH_TIMEOUT_MS),
	);

	await Promise.race([runAll, globalTimeout]);

	// 5. Clean up: any agents still 'running' in Redis after the race → timeout in DB
	const rawFinal = await redis.get(PROGRESS_KEY(requestId));
	if (rawFinal) {
		const finalState: ResearchProgressState = JSON.parse(rawFinal);
		const stillRunning = finalState.agents
			.map((a, i) => ({ a, i }))
			.filter(({ a }) => a.status === "running");

		for (const { i } of stillRunning) {
			const rowId = rowIds[i];
			if (rowId) {
				await updateAgentDb(rowId, "timeout", undefined, "120 s global deadline exceeded");
			}
			await updateProgress(requestId, i, { outcome: "timeout", summary: "global timeout" });
		}
	}
}
