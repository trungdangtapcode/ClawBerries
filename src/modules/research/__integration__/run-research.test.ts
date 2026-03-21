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
import type { CandidateProfile } from "@/shared/types/candidate.js";
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

const agentResponses: Record<string, { result: Record<string, unknown> }> = {
	linkedin: {
		result: {
			profileFound: true,
			positions: [
				{
					title: "Engineer",
					company: "Acme",
					startDate: "2021-01",
					endDate: "2023-01",
				},
			],
			education: [],
			endorsementsCount: 5,
			recommendationsCount: 2,
			discrepancies: [],
		},
	},
	github: {
		result: {
			username: "testuser",
			totalRepos: 12,
			totalStars: 34,
			commitsLast90Days: 87,
			topLanguages: [{ language: "TypeScript", percentage: 60 }],
			notableRepos: [],
			skillsEvidence: { TypeScript: true },
		},
	},
	default: { result: { ok: true } },
};

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
			try {
				body = JSON.parse(raw);
			} catch { /* ignore */ }

			// Route based on the starting URL or goal text
			const signal = body.url ?? body.goal ?? "";
			let result: Record<string, unknown> = agentResponses.default!.result;
			if (signal.includes("linkedin") || (body.goal?.toLowerCase().includes("linkedin"))) {
				result = agentResponses.linkedin!.result;
			} else if (signal.includes("github") || (body.goal?.toLowerCase().includes("github"))) {
				result = agentResponses.github!.result;
			}

			res.writeHead(200, { "Content-Type": "text/event-stream" });
			res.end(buildSseResponse(result));
		});
	});

	await new Promise<void>((resolve) => fakeServer.listen(0, resolve));
	const addr = fakeServer.address() as { port: number };
	fakePort = addr.port;
	// Intercept fetch: redirect all calls to agent.tinyfish.ai → fake server
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		const u = url.toString().replace("https://agent.tinyfish.ai", `http://127.0.0.1:${fakePort}`);
		return originalFetch(u, init);
	};
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const testProfile: CandidateProfile = {
	fullName: "Integration Test User",
	email: "test@example.com",
	phone: null,
	links: {
		linkedin: "https://www.linkedin.com/in/testuser",
		github: "https://github.com/testuser",
		portfolio: null,
	},
	workHistory: [
		{
			company: "Acme Corp",
			title: "Software Engineer",
			startDate: "2021-01",
			endDate: "2023-06",
			description: null,
		},
	],
	education: [],
	skillsClaimed: ["TypeScript", "Node.js"],
};

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
		await runResearch(requestId, testProfile);

		const raw = await redisClient.get(`progress:${requestId}`);
		expect(raw).not.toBeNull();

		const state: ResearchProgressState = JSON.parse(raw!);
		// linkedin + github + employer(Acme Corp) + web_search = 4
		expect(state.total).toBe(4);
		expect(state.startedAt).toBeGreaterThan(0);
		expect(state.agents).toHaveLength(4);
	});

	it("creates agent_results rows in the database for each agent", async () => {
		await runResearch(requestId, testProfile);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		expect(rows.length).toBe(4);
	});

	it("marks the research_request status as 'researching'", async () => {
		await runResearch(requestId, testProfile);

		const [req] = await db
			.select()
			.from(schema.researchRequests)
			.where(eq(schema.researchRequests.id, requestId));

		expect(req?.status).toBe("researching");
	});

	it("all agents complete and Redis done counter equals total", async () => {
		await runResearch(requestId, testProfile);

		const raw = await redisClient.get(`progress:${requestId}`);
		const state: ResearchProgressState = JSON.parse(raw!);

		const done = state.completed + state.failed + state.timedOut;
		expect(done).toBe(state.total);
	});

	it("each agent progress item has a non-null summary after completion", async () => {
		await runResearch(requestId, testProfile);

		const raw = await redisClient.get(`progress:${requestId}`);
		const state: ResearchProgressState = JSON.parse(raw!);

		for (const agent of state.agents) {
			expect(agent.status).not.toBe("running");
			expect(agent.summary).not.toBeNull();
		}
	});

	it("agent_results rows are updated with completed status and duration", async () => {
		await runResearch(requestId, testProfile);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		for (const row of rows) {
			expect(["completed", "failed", "timeout"]).toContain(row.status);
			expect(row.completedAt).not.toBeNull();
		}
	});

	it("spawns exactly one employer agent per company (max 5)", async () => {
		const manyJobsProfile: CandidateProfile = {
			...testProfile,
			links: { linkedin: null, github: null, portfolio: null },
			workHistory: [
				{ company: "Alpha", title: "E", startDate: null, endDate: null, description: null },
				{ company: "Beta", title: "E", startDate: null, endDate: null, description: null },
				{ company: "Gamma", title: "E", startDate: null, endDate: null, description: null },
				{ company: "Delta", title: "E", startDate: null, endDate: null, description: null },
				{ company: "Epsilon", title: "E", startDate: null, endDate: null, description: null },
				{ company: "Zeta", title: "E", startDate: null, endDate: null, description: null }, // >5, should be skipped
			],
		};

		await runResearch(requestId, manyJobsProfile);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		const employerRows = rows.filter((r) => r.agentType === "employer");
		expect(employerRows).toHaveLength(5);
	});
});
