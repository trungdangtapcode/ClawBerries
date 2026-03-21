/**
 * Integration tests for the research orchestrator (Step 5).
 *
 * Uses:
 *  - Real Redis on localhost:6379  (docker-compose up -d)
 *  - Real Postgres on localhost:5432 (docker-compose up -d)
 *  - Fake TinyFish in-process HTTP server (no external calls)
 *
 * Run: pnpm test:integration
 */
import { createServer, type Server } from "node:http";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/shared/db/schema.js";
import type { DispatchPreviewItem } from "@/modules/parser/dispatcher.js";
import type { ResearchProgressState } from "@/shared/types/research.js";
import { runResearch } from "@/modules/research/run-research.js";

// ─── Infrastructure ────────────────────────────────────────────────────────────

const DB_URL =
	process.env.DATABASE_URL ??
	"postgres://clawberries:clawberries@localhost:5432/clawberries";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const pg = postgres(DB_URL);
const db = drizzle(pg, { schema });
const redisClient = new Redis(REDIS_URL);

// ─── Fake TinyFish server ─────────────────────────────────────────────────────

let fakePort: number;
let fakeServer: Server;
let originalFetch: typeof globalThis.fetch;

function buildSseResponse(result: unknown): string {
	const runId = `run-${Math.random().toString(36).slice(2, 8)}`;
	return [
		`data: ${JSON.stringify({ type: "STARTED", run_id: runId })}\n\n`,
		`data: ${JSON.stringify({ type: "COMPLETE", run_id: runId, status: "COMPLETED", result })}\n\n`,
	].join("");
}

async function startFakeTinyFish(): Promise<void> {
	fakeServer = createServer((req, res) => {
		let raw = "";
		req.on("data", (c) => { raw += c; });
		req.on("end", () => {
			let body: { url?: string; goal?: string } = {};
			try { body = JSON.parse(raw); } catch { /* ignore */ }

			// Return a result matching the agent type inferred from the url/goal
			const signal = `${body.url ?? ""} ${body.goal ?? ""}`.toLowerCase();
			let result: Record<string, unknown> = { ok: true, summary: "default agent completed" };

			if (signal.includes("linkedin")) {
				result = { profileFound: true, positions: [], discrepancies: [], summary: "linkedin ok" };
			} else if (signal.includes("github")) {
				result = { username: "testuser", totalRepos: 5, summary: "github ok" };
			} else if (signal.includes("google") || signal.includes("search")) {
				result = { mentions: [], summary: "web search ok" };
			}

			res.writeHead(200, { "Content-Type": "text/event-stream" });
			res.end(buildSseResponse(result));
		});
	});

	await new Promise<void>((resolve) => fakeServer.listen(0, resolve));
	const addr = fakeServer.address() as { port: number };
	fakePort = addr.port;

	// Intercept fetch: redirect all calls to agent.tinyfish.ai → fake server
	originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		const u = url.toString().replace("https://agent.tinyfish.ai", `http://127.0.0.1:${fakePort}`);
		return originalFetch(u, init);
	};
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal DispatchPreviewItem[] matching what Step 4 would produce for a candidate
 *  with a LinkedIn, GitHub, one employer, and a web search agent. */
const testItems: DispatchPreviewItem[] = [
	{
		agentType: "linkedin",
		target: "https://www.linkedin.com/in/testuser",
		targetUrl: "https://www.linkedin.com/in/testuser",
		timeout: 45_000,
		browserProfile: "stealth",
		prompt: "Verify name variants and employment history.",
	},
	{
		agentType: "github",
		target: "https://github.com/testuser",
		targetUrl: "https://api.github.com/users/testuser",
		timeout: 30_000,
		browserProfile: "lite",
		prompt: "Check repo languages vs claimed skills.",
	},
	{
		agentType: "employer",
		target: "Acme Corp",
		targetUrl: "https://www.google.com/search?q=%22Acme+Corp%22+Vietnam+company",
		timeout: 45_000,
		browserProfile: "stealth",
		prompt: "Verify company existence via registry.",
	},
	{
		agentType: "web_search",
		target: "Integration Test User Acme Corp",
		targetUrl: "https://www.google.com/search?q=Integration+Test+User+Acme+Corp",
		timeout: 30_000,
		browserProfile: "lite",
		prompt: "Search public web for profile consistency.",
	},
];

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let requestId: string;

beforeAll(async () => {
	await startFakeTinyFish();

	const [row] = await db
		.insert(schema.researchRequests)
		.values({ telegramChatId: "chat-integration-test", status: "parsing" })
		.returning({ id: schema.researchRequests.id });

	requestId = row!.id;
});

afterAll(async () => {
	globalThis.fetch = originalFetch;
	fakeServer.close();

	if (requestId) {
		await db
			.delete(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));
		await db
			.delete(schema.researchRequests)
			.where(eq(schema.researchRequests.id, requestId));
	}

	await redisClient.del(`progress:${requestId}`);
	await redisClient.quit();
	await pg.end();
});

beforeEach(async () => {
	// Reset Redis state between tests
	await redisClient.del(`progress:${requestId}`);
	// Reset DB agent rows
	if (requestId) {
		await db
			.delete(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));
	}
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("runResearch — integration", () => {
	it("initializes Redis progress state with the correct total agent count", async () => {
		await runResearch(requestId, testItems);

		const raw = await redisClient.get(`progress:${requestId}`);
		expect(raw).not.toBeNull();

		const state: ResearchProgressState = JSON.parse(raw!);
		expect(state.total).toBe(testItems.length); // 4 agents
		expect(state.startedAt).toBeGreaterThan(0);
		expect(state.agents).toHaveLength(testItems.length);
	});

	it("creates agent_results rows in the database for each agent", async () => {
		await runResearch(requestId, testItems);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		expect(rows.length).toBe(testItems.length);
	});

	it("marks the research_request status as 'researching'", async () => {
		await runResearch(requestId, testItems);

		const [req] = await db
			.select()
			.from(schema.researchRequests)
			.where(eq(schema.researchRequests.id, requestId));

		expect(req?.status).toBe("researching");
	});

	it("all agents complete and Redis done counter equals total", async () => {
		await runResearch(requestId, testItems);

		const raw = await redisClient.get(`progress:${requestId}`);
		const state: ResearchProgressState = JSON.parse(raw!);

		const done = state.completed + state.failed + state.timedOut;
		expect(done).toBe(state.total);
	});

	it("each agent progress item has a non-null summary after completion", async () => {
		await runResearch(requestId, testItems);

		const raw = await redisClient.get(`progress:${requestId}`);
		const state: ResearchProgressState = JSON.parse(raw!);

		for (const agent of state.agents) {
			expect(agent.status).not.toBe("running");
			expect(agent.summary).not.toBeNull();
		}
	});

	it("agent_results rows are updated with completed status and duration", async () => {
		await runResearch(requestId, testItems);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		for (const row of rows) {
			expect(["completed", "failed", "timeout"]).toContain(row.status);
			expect(row.completedAt).not.toBeNull();
		}
	});

	it("each item's agentType and target are recorded in agent_results", async () => {
		await runResearch(requestId, testItems);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		const types = rows.map((r) => r.agentType).sort();
		const expected = testItems.map((i) => i.agentType).sort();
		expect(types).toEqual(expected);
	});
});
