import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/config/env.js", () => ({
	config: {
		TINYFISH_URL: "http://tinyfish.test",
		TELEGRAM_BOT_TOKEN: "tg-token",
		REDIS_URL: "redis://test",
	},
}));

// Provide a controllable Redis store
const redisData = new Map<string, string>();
vi.mock("@/shared/redis/index.js", () => ({
	redis: {
		get: vi.fn(async (k: string) => redisData.get(k) ?? null),
		set: vi.fn(async (k: string, v: string) => {
			redisData.set(k, v);
		}),
	},
}));

import type { ResearchProgressState } from "@/shared/types/research.js";
import { reportProgress } from "../progress.js";

function makeState(
	overrides: Partial<ResearchProgressState> = {},
): ResearchProgressState {
	return {
		total: 4,
		completed: 0,
		failed: 0,
		timedOut: 0,
		startedAt: Date.now(),
		agents: [
			{
				agentType: "linkedin",
				target: "linkedin.com/in/test",
				status: "running",
				summary: null,
				durationMs: null,
			},
			{
				agentType: "github",
				target: "github.com/test",
				status: "running",
				summary: null,
				durationMs: null,
			},
			{
				agentType: "employer",
				target: "Acme",
				status: "running",
				summary: null,
				durationMs: null,
			},
			{
				agentType: "web_search",
				target: "Test User",
				status: "running",
				summary: null,
				durationMs: null,
			},
		],
		...overrides,
	};
}

describe("reportProgress", () => {
	let fetchCalls: Array<[string, RequestInit]> = [];

	beforeEach(() => {
		redisData.clear();
		fetchCalls = [];
		vi.useFakeTimers();

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				fetchCalls.push([url, init]);
				return { ok: true, json: async () => ({}) };
			}),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("sends no message if research completes within 45 seconds", async () => {
		// Set a state where all done
		const state = makeState({
			completed: 4,
			agents: makeState().agents.map((a) => ({
				...a,
				status: "completed" as const,
				summary: "ok",
			})),
		});
		redisData.set("progress:req-fast", JSON.stringify(state));

		const progressPromise = reportProgress("req-fast", "chat-1");

		// Advance past first poll interval — already all done, < 45 s
		vi.advanceTimersByTime(10_001);
		await vi.runAllTimersAsync();
		await progressPromise;

		const telegramCalls = fetchCalls.filter(([u]) => u.includes("telegram"));
		expect(telegramCalls).toHaveLength(0);
	});

	it("sends a message at ≥ 50% completion after first poll interval", async () => {
		// 2 of 4 done — 50%
		const state = makeState({
			completed: 2,
			agents: makeState().agents.map((a, i) => ({
				...a,
				status: i < 2 ? ("completed" as const) : ("running" as const),
				summary: i < 2 ? "done" : null,
			})),
		});
		redisData.set("progress:req-half", JSON.stringify(state));

		// After the message is sent, simulate all done so the loop exits
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				fetchCalls.push([url, init]);
				// Once the message is sent, mark all complete so loop exits
				const doneState = makeState({ completed: 4 });
				redisData.set("progress:req-half", JSON.stringify(doneState));
				return { ok: true, json: async () => ({}) };
			}),
		);

		const progressPromise = reportProgress("req-half", "chat-2");
		vi.advanceTimersByTime(10_001);
		await vi.runAllTimersAsync();
		await progressPromise;

		const telegramCalls = fetchCalls.filter(([u]) => u.includes("telegram"));
		expect(telegramCalls.length).toBeGreaterThanOrEqual(1);
	});

	it("sends at most 2 messages", async () => {
		// Always return 50% complete so the loop keeps wanting to send
		const halfState = makeState({ completed: 2 });
		redisData.set("progress:req-many", JSON.stringify(halfState));

		const progressPromise = reportProgress("req-many", "chat-3");

		// Advance through many poll intervals
		for (let i = 0; i < 10; i++) {
			vi.advanceTimersByTime(30_001);
			await vi.runAllTimersAsync();
		}
		// Mark all done so the loop exits
		redisData.set(
			"progress:req-many",
			JSON.stringify(makeState({ completed: 4 })),
		);
		vi.advanceTimersByTime(10_001);
		await vi.runAllTimersAsync();
		await progressPromise;

		const telegramCalls = fetchCalls.filter(([u]) => u.includes("telegram"));
		expect(telegramCalls.length).toBeLessThanOrEqual(2);
	});
});
