import { db, schema } from "@/shared/db/index.js";
import { redis } from "@/shared/redis/index.js";
import { eq } from "drizzle-orm";
import type { CandidateProfile } from "@/shared/types/candidate.js";
import type {
	AgentProgressItem,
	AgentType,
	ResearchProgressState,
} from "@/shared/types/research.js";
import { runLinkedInAgent } from "./agents/linkedin.js";
import { runGitHubAgent } from "./agents/github.js";
import { runPortfolioAgent } from "./agents/portfolio.js";
import { runEmployerAgent } from "./agents/employer.js";
import { runWebSearchAgent } from "./agents/web-search.js";

/** 120-second hard timeout for the entire research phase */
const RESEARCH_TIMEOUT_MS = 120_000;

const PROGRESS_KEY = (requestId: string) => `progress:${requestId}`;
const PROGRESS_TTL_SECONDS = 600;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentTask {
	agentType: AgentType;
	/** Human-readable target (URL, company name, etc.) */
	target: string;
	/** The async work, already bound to its inputs */
	run: () => Promise<Record<string, unknown>>;
	/** DB row id — set after INSERT */
	dbRowId?: string;
}

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

// ─── Agent plan builder ───────────────────────────────────────────────────────

function buildTasks(profile: CandidateProfile, requestId: string): AgentTask[] {
	const tasks: AgentTask[] = [];

	if (profile.links.linkedin) {
		tasks.push({
			agentType: "linkedin",
			target: profile.links.linkedin,
			run: () => runLinkedInAgent(profile.links.linkedin!, requestId)
				.then((r) => r as unknown as Record<string, unknown>),
		});
	}

	if (profile.links.github) {
		tasks.push({
			agentType: "github",
			target: profile.links.github,
			run: () => runGitHubAgent(profile.links.github!, requestId)
				.then((r) => r as unknown as Record<string, unknown>),
		});
	}

	if (profile.links.portfolio) {
		tasks.push({
			agentType: "portfolio",
			target: profile.links.portfolio,
			run: () => runPortfolioAgent(profile.links.portfolio!, requestId)
				.then((r) => r as unknown as Record<string, unknown>),
		});
	}

	// One employer agent per company (max 5 most recent)
	const companies = profile.workHistory.slice(0, 5);
	for (const entry of companies) {
		const company = entry.company;
		tasks.push({
			agentType: "employer",
			target: company,
			run: () => runEmployerAgent(company, requestId)
				.then((r) => r as unknown as Record<string, unknown>),
		});
	}

	// Web search is always spawned
	const recentCompany = profile.workHistory[0]?.company ?? null;
	tasks.push({
		agentType: "web_search",
		target: profile.fullName,
		run: () => runWebSearchAgent(profile.fullName, recentCompany, requestId)
			.then((r) => r as unknown as Record<string, unknown>),
	});

	return tasks;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Step 5: Parallel Research Execution
 *
 * Orchestrates all research agents in parallel for a given candidate.
 * Writes per-agent results to `agent_results` table and maintains
 * a Redis progress key at `progress:{requestId}` throughout.
 *
 * Enforces a 120-second hard timeout across the entire research phase.
 */
export async function runResearch(
	requestId: string,
	profile: CandidateProfile,
): Promise<void> {
	const tasks = buildTasks(profile, requestId);

	// 1. INSERT running rows into agent_results
	const insertedRows = await db
		.insert(schema.agentResults)
		.values(
			tasks.map((t) => ({
				requestId,
				agentType: t.agentType,
				agentTarget: t.target,
				status: "running" as const,
			})),
		)
		.returning({ id: schema.agentResults.id });

	for (let i = 0; i < tasks.length; i++) {
		// tasks and insertedRows are built 1:1 — both have length === tasks.length
		const task = tasks[i] as AgentTask;
		task.dbRowId = insertedRows[i]!.id;
	}

	// 2. Initialise Redis progress state
	const progressItems: AgentProgressItem[] = tasks.map((t) => ({
		agentType: t.agentType,
		target: t.target,
		status: "running",
		summary: null,
		durationMs: null,
	}));

	const initialState: ResearchProgressState = {
		total: tasks.length,
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

	// 4. Run all agents in parallel, with an overall 120 s timeout sentinel
	const runAll = Promise.allSettled(
		tasks.map(async (task, idx) => {
			const start = Date.now();
			try {
				const result = await task.run();
				const durationMs = Date.now() - start;

				if (task.dbRowId) {
					await updateAgentDb(task.dbRowId, "completed", result);
				}
				await updateProgress(requestId, idx, {
					outcome: "completed",
					summary: (result as { summary?: string }).summary ?? null,
					durationMs,
				});
			} catch (err) {
				const durationMs = Date.now() - start;
				const isTimeout =
					err instanceof Error && err.name === "AbortError";
				const status = isTimeout ? "timeout" : "failed";
				const message = err instanceof Error ? err.message : String(err);

				if (task.dbRowId) {
					await updateAgentDb(task.dbRowId, status, undefined, message);
				}
				await updateProgress(requestId, idx, {
					outcome: status,
					summary: isTimeout ? "timed out" : `failed: ${message}`,
					durationMs,
				});
			}
		}),
	);

	// Hard 120-second deadline across ALL agents
	const timeout = new Promise<void>((resolve) =>
		setTimeout(() => {
			resolve();
		}, RESEARCH_TIMEOUT_MS),
	);

	await Promise.race([runAll, timeout]);

	// Any agents still "running" in Redis after the race are now timed out in DB.
	// (Their AbortControllers already fired at their per-agent timeouts;
	//  this covers the edge case of an agent that somehow never resolved.)
	const rawFinal = await redis.get(PROGRESS_KEY(requestId));
	if (rawFinal) {
		const finalState: ResearchProgressState = JSON.parse(rawFinal);
		const stillRunning = finalState.agents
			.map((a, i) => ({ a, i }))
			.filter(({ a }) => a.status === "running");

		for (const { i } of stillRunning) {
			const task = tasks[i];
			if (task?.dbRowId) {
				await updateAgentDb(task.dbRowId, "timeout", undefined, "120 s global deadline exceeded");
			}
			await updateProgress(requestId, i, { outcome: "timeout", summary: "global timeout" });
		}
	}
}
