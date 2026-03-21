/**
 * End-to-end integration test: Steps 4 → 5 → 6
 *
 * Tests the full pipeline from agent planning (Step 4) through parallel research
 * (Step 5) and progress reporting (Step 6) against real Postgres, Redis, and TinyFish.
 *
 * Step 3 (PDF parsing) is not tested here to avoid a GEMINI_API_KEY dependency.
 * Instead, a pre-built PdfOcrResult fixture drives Step 4's planAgentTargets().
 *
 * Requires:
 *   - docker-compose up -d  (Postgres + Redis)
 *   - TINYFISH_API_KEY in .env
 *
 * Run: pnpm test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/shared/db/schema.js";
import { previewAgentTargets } from "@/modules/parser/dispatcher.js";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import type { ResearchProgressState } from "@/shared/types/research.js";
import { runResearch } from "@/modules/research/run-research.js";
import { reportProgress } from "@/modules/research/progress.js";

// ─── Infrastructure ────────────────────────────────────────────────────────────

const DB_URL =
	process.env.DATABASE_URL ??
	"postgres://clawberries:clawberries@localhost:5432/clawberries";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const pg = postgres(DB_URL);
const db = drizzle(pg, { schema });
const redisClient = new Redis(REDIS_URL);

// ─── PdfOcrResult fixture (represents Step 3 output) ─────────────────────────

/**
 * A minimal but realistic PdfOcrResult that would come from Step 3 (Gemini OCR).
 * Drives Step 4's planAgentTargets() to produce a real DispatchPreviewItem[] plan.
 */
const ocrFixture: PdfOcrResult = {
	identity: {
		fullName: "E2E Test Candidate",
		nameVariants: ["E2E Test Candidate", "Test Candidate"],
		email: "e2e@example.com",
		phone: null,
		location: "Ho Chi Minh City, Vietnam",
	},
	education: [
		{
			school: "Hanoi University of Science and Technology",
			degree: "Bachelor",
			field: "Computer Science",
			startDate: "2016-09",
			endDate: "2020-06",
			gpa: { value: 3.5, scale: 4 },
		},
	],
	workHistory: [
		{
			company: "TechCorp Vietnam",
			title: "Software Engineer",
			startDate: "2020-07",
			endDate: null,
			description: "Built microservices with TypeScript and Node.js",
		},
	],
	skills: [
		{ name: "TypeScript", evidencedBy: "github" },
		{ name: "Node.js", evidencedBy: "claim_only" },
		{ name: "PostgreSQL", evidencedBy: "claim_only" },
	],
	links: [
		{
			href: "https://github.com/e2etestcandidate",
			type: "github",
			text: "github.com/e2etestcandidate",
			page: 1,
		},
	],
	publications: [],
	awards: [],
	documentMeta: { pageCount: 2, language: "en" },
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let requestId: string;

beforeAll(async () => {
	const [row] = await db
		.insert(schema.researchRequests)
		.values({ telegramChatId: "e2e-test", status: "parsing" })
		.returning({ id: schema.researchRequests.id });

	requestId = row!.id;
});

afterAll(async () => {
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

// ─── E2E Tests ────────────────────────────────────────────────────────────────

describe("E2E pipeline: Step 4 → Step 5 → Step 6", () => {
	it("Step 4 produces a DispatchPreviewItem[] plan from the OCR fixture", () => {
		const items = previewAgentTargets(ocrFixture);

		// At minimum: github agent + employer(TechCorp Vietnam) + web_search
		expect(items.length).toBeGreaterThanOrEqual(3);

		for (const item of items) {
			expect(item.targetUrl).toMatch(/^https?:\/\//);
			expect(typeof item.prompt).toBe("string");
			expect(item.prompt.length).toBeGreaterThan(0);
			expect(["lite", "stealth"]).toContain(item.browserProfile);
			expect(item.timeout).toBeGreaterThan(0);
		}
	});

	it("Step 5 runs all planned agents and records results in DB + Redis", async () => {
		const items = previewAgentTargets(ocrFixture);

		// Run Steps 5 + 6 concurrently (real TinyFish API + real Redis/Postgres)
		await Promise.all([
			runResearch(requestId, items),
			reportProgress(requestId, ""), // empty chatId → no Telegram messages sent
		]);

		// ── DB assertions ──────────────────────────────────────────────────────
		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		expect(rows.length).toBe(items.length);

		for (const row of rows) {
			expect(["completed", "failed", "timeout"]).toContain(row.status);
			expect(row.completedAt).not.toBeNull();
		}

		// ── Redis assertions ───────────────────────────────────────────────────
		const raw = await redisClient.get(`progress:${requestId}`);
		expect(raw).not.toBeNull();

		const state: ResearchProgressState = JSON.parse(raw!);
		expect(state.total).toBe(items.length);

		const finished = state.completed + state.failed + state.timedOut;
		expect(finished).toBe(state.total); // no agents stuck in 'running'

		for (const agent of state.agents) {
			expect(agent.status).not.toBe("running");
		}

		// ── research_requests status ───────────────────────────────────────────
		const [req] = await db
			.select()
			.from(schema.researchRequests)
			.where(eq(schema.researchRequests.id, requestId));

		expect(req?.status).toBe("researching");
	}, 180_000); // 3 min budget — real TinyFish calls

	it("each planned agent type corresponds to an agent_results row", async () => {
		const items = previewAgentTargets(ocrFixture);

		const rows = await db
			.select()
			.from(schema.agentResults)
			.where(eq(schema.agentResults.requestId, requestId));

		const recordedTypes = rows.map((r) => r.agentType).sort();
		const plannedTypes = items.map((i) => i.agentType).sort();

		expect(recordedTypes).toEqual(plannedTypes);
	});

	it("browserProfile from the plan matches the expected profile for known agent types", () => {
		const items = previewAgentTargets(ocrFixture);

		for (const item of items) {
			if (item.agentType === "github" || item.agentType === "web_search") {
				expect(item.browserProfile).toBe("lite");
			} else if (
				item.agentType === "linkedin" ||
				item.agentType === "portfolio" ||
				item.agentType === "employer"
			) {
				expect(item.browserProfile).toBe("stealth");
			}
		}
	});
});
