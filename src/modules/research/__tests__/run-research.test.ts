import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DispatchPreviewItem } from "@/modules/parser/dispatcher.js";

// ─── Hoist shared mocks (must be before vi.mock calls, which are hoisted) ─────

const { callTinyFishMock, redisMock, dbMock, redisStore } = vi.hoisted(() => {
	const redisStore = new Map<string, string>();

	const redisMock = {
		get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
		set: vi.fn(async (k: string, v: string) => { redisStore.set(k, v); }),
	};

	// Chainable db mock — insert/update chains must survive clearAllMocks
	const makePgChain = () => ({
		set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
	});
	const makeInsertChain = (rows: unknown[]) => ({
		values: vi.fn(() => ({
			returning: vi.fn(() =>
				Promise.resolve((rows as unknown[]).map((_: unknown, i: number) => ({ id: `row-${i}` }))),
			),
		})),
	});

	const dbMock = {
		update: vi.fn(() => makePgChain()),
		insert: vi.fn(() => makeInsertChain([])),
	};

	const callTinyFishMock = vi.fn().mockResolvedValue({
		run_id: "mock-run-id",
		result: { ok: true, summary: "mock result" },
	});

	return { callTinyFishMock, redisMock, dbMock, redisStore };
});

// ─── vi.mock factories — must only reference hoisted variables ─────────────────

vi.mock("@/shared/config/env.js", () => ({
	config: {
		TINYFISH_API_KEY: "test-key",
		DATABASE_URL: "postgres://test",
		REDIS_URL: "redis://test",
	},
}));

vi.mock("@/shared/db/index.js", () => ({
	db: dbMock,
	schema: { agentResults: {}, researchRequests: {} },
}));

vi.mock("@/shared/redis/index.js", () => ({ redis: redisMock }));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("../tinyfish-client.js", () => ({ callTinyFish: callTinyFishMock }));

// ─── Import under test (after all mocks) ──────────────────────────────────────

import { runResearch } from "../run-research.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const linkedinItem: DispatchPreviewItem = {
	agentType: "linkedin",
	target: "https://linkedin.com/in/testuser",
	targetUrl: "https://linkedin.com/in/testuser",
	timeout: 45_000,
	browserProfile: "stealth",
	prompt: "Verify employment history.",
};

const githubItem: DispatchPreviewItem = {
	agentType: "github",
	target: "https://github.com/testuser",
	targetUrl: "https://api.github.com/users/testuser",
	timeout: 30_000,
	browserProfile: "lite",
	prompt: "Check repos vs claimed skills.",
};

const employerItem: DispatchPreviewItem = {
	agentType: "employer",
	target: "Acme Corp",
	targetUrl: "https://www.google.com/search?q=Acme+Corp+Vietnam",
	timeout: 45_000,
	browserProfile: "stealth",
	prompt: "Verify company existence.",
};

const webSearchItem: DispatchPreviewItem = {
	agentType: "web_search",
	target: "Test User Acme Corp",
	targetUrl: "https://www.google.com/search?q=Test+User+Acme+Corp",
	timeout: 30_000,
	browserProfile: "lite",
	prompt: "Search public web for profile.",
};

const baseItems = [linkedinItem, githubItem, employerItem, webSearchItem];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runResearch", () => {
	beforeEach(() => {
		// Clear Redis store and mock call history
		redisStore.clear();
		callTinyFishMock.mockClear();
		callTinyFishMock.mockResolvedValue({
			run_id: "mock-run-id",
			result: { ok: true, summary: "mock result" },
		});
		redisMock.get.mockClear();
		redisMock.set.mockClear();
		dbMock.insert.mockClear();
		dbMock.update.mockClear();

		// Re-establish db insert implementation (returns indexed row ids)
		dbMock.insert.mockImplementation((() => ({
			values: vi.fn((rows: unknown[]) => ({
				returning: vi.fn(() =>
					Promise.resolve((rows as unknown[]).map((_: unknown, i: number) => ({ id: `row-${i}` }))),
				),
			})),
		})) as unknown as typeof dbMock.insert);
		dbMock.update.mockImplementation(() => ({
			set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })),
		}));
	});

	it("calls callTinyFish once per item with correct url, goal, and browser_profile", async () => {
		await runResearch("req-1", baseItems);

		expect(callTinyFishMock).toHaveBeenCalledTimes(baseItems.length);

		expect(callTinyFishMock).toHaveBeenCalledWith(
			expect.objectContaining({ url: linkedinItem.targetUrl, goal: linkedinItem.prompt, browser_profile: "stealth" }),
			expect.anything(), // AbortSignal
		);
		expect(callTinyFishMock).toHaveBeenCalledWith(
			expect.objectContaining({ url: githubItem.targetUrl, goal: githubItem.prompt, browser_profile: "lite" }),
			expect.anything(),
		);
	});

	it("initializes Redis progress state with correct total count", async () => {
		await runResearch("req-2", baseItems);

		const raw = redisStore.get("progress:req-2");
		expect(raw).toBeDefined();
		const state = JSON.parse(raw!);
		expect(state.total).toBe(baseItems.length);
		expect(typeof state.completed).toBe("number");
		expect(Array.isArray(state.agents)).toBe(true);
		expect(state.agents).toHaveLength(baseItems.length);
	});

	it("all agents complete when callTinyFish resolves immediately", async () => {
		await runResearch("req-3", baseItems);

		const raw = redisStore.get("progress:req-3");
		const state = JSON.parse(raw!);
		const done = state.completed + state.failed + state.timedOut;
		expect(done).toBe(state.total);
		for (const agent of state.agents) {
			expect(agent.status).not.toBe("running");
		}
	});

	it("returns early without DB/Redis writes when items list is empty", async () => {
		await runResearch("req-4", []);
		expect(dbMock.insert).not.toHaveBeenCalled();
	});

	it("marks failed agents when callTinyFish rejects", async () => {
		// Use a single item to avoid concurrent Redis write races in the mock
		callTinyFishMock.mockRejectedValueOnce(new Error("network error"));

		await runResearch("req-5", [linkedinItem]);

		const raw = redisStore.get("progress:req-5");
		const state = JSON.parse(raw!);
		expect(state.failed).toBeGreaterThanOrEqual(1);
	});

	it("records each item's agentType and target in the inserted rows", async () => {
		let capturedRows: Array<{ agentType: string; agentTarget: string }> = [];
		dbMock.insert.mockImplementation((() => ({
			values: vi.fn((rows: unknown[]) => {
				capturedRows = rows as Array<{ agentType: string; agentTarget: string }>;
				return {
					returning: vi.fn(() =>
						Promise.resolve((rows as unknown[]).map((_: unknown, i: number) => ({ id: `row-${i}` }))),
					),
				};
			}),
		})) as unknown as typeof dbMock.insert);

		await runResearch("req-6", baseItems);

		expect(capturedRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ agentType: "linkedin", agentTarget: linkedinItem.target }),
				expect.objectContaining({ agentType: "github", agentTarget: githubItem.target }),
			]),
		);
	});
});
