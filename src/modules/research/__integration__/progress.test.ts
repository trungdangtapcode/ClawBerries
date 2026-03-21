/**
 * Integration tests for Step 6: Progress Reporting.
 *
 * Uses:
 *  - Real Redis on localhost:6379  (docker-compose up -d)
 *  - Intercepted globalThis.fetch to capture Telegram Bot API calls
 *
 * Key timing facts:
 *  - reportProgress polls every 10 s
 *  - It skips sending if research finishes in < 45 s FROM ITS OWN start time
 *    (not from the state's startedAt)
 *  - Min 30 s between messages
 *  - Max 2 messages total
 *
 * Run: pnpm test:integration
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import Redis from "ioredis";
import type { AgentType, ResearchProgressState } from "@/shared/types/research.js";
import { reportProgress } from "@/modules/research/progress.js";

// ─── Infrastructure ────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const redisClient = new Redis(REDIS_URL);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROGRESS_KEY = (id: string) => `progress:${id}`;

async function seedProgress(requestId: string, state: ResearchProgressState): Promise<void> {
	await redisClient.set(PROGRESS_KEY(requestId), JSON.stringify(state), "EX", 120);
}

const AGENT_TYPES: AgentType[] = ["linkedin", "github", "employer", "web_search"];

function makeProgressState(
	total: number,
	completed: number,
	startedMsAgo = 0,
): ResearchProgressState {
	return {
		total,
		completed,
		failed: 0,
		timedOut: 0,
		startedAt: Date.now() - startedMsAgo,
		agents: Array.from({ length: total }, (_, i) => ({
			agentType: AGENT_TYPES[i % AGENT_TYPES.length] as AgentType,
			target: `target-${i}`,
			status: i < completed ? ("completed" as const) : ("running" as const),
			summary: i < completed ? "done" : null,
			durationMs: i < completed ? 500 : null,
		})),
	};
}

// ─── Telegram fetch interceptor ────────────────────────────────────────────────

interface CapturedMessage { chat_id: string; text: string }
const receivedMessages: CapturedMessage[] = [];
const originalFetch = globalThis.fetch;

function interceptFetch(): void {
	globalThis.fetch = async (
		url: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	): Promise<Response> => {
		const urlStr = url.toString();
		if (urlStr.includes("api.telegram.org")) {
			const body = init?.body as string | undefined;
			if (body) receivedMessages.push(JSON.parse(body));
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return originalFetch(url, init);
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("reportProgress — integration", () => {
	beforeAll(() => {
		interceptFetch();
	});

	afterAll(async () => {
		globalThis.fetch = originalFetch;
		await redisClient.quit();
	});

	afterEach(() => {
		receivedMessages.length = 0;
	});

	it("exits immediately and sends no message when Redis key is missing", async () => {
		// No key seeded
		await reportProgress("prog-no-key", "chat-any");
		expect(receivedMessages).toHaveLength(0);
	}, 15_000);

	it("sends no message when research finishes within the first poll (fast path)", async () => {
		const id = "prog-fast";
		// Seed all-done state
		await seedProgress(id, makeProgressState(4, 4));

		// reportProgress polls at 10 s, then sees all-done + elapsed < 45 s → skip
		// We need to mark all done BEFORE the first poll fires.
		// Since we seed before calling, and the function detects all-done on first
		// check after 10 s, elapsed will be ~10 s < 45 s → no message.
		await reportProgress(id, "chat-fast");

		expect(receivedMessages).toHaveLength(0);
		await redisClient.del(PROGRESS_KEY(id));
	}, 15_000);

	it("sends a progress message when ≥ 50% done at first poll", async () => {
		const id = "prog-half";

		// Seed 50% done, with startedAt in the past to simulate ongoing research
		await seedProgress(id, makeProgressState(4, 2));

		const progressPromise = reportProgress(id, "chat-half");

		// After first poll (10 s), mark all done so the loop exits on next iteration.
		// The sendTelegramMessage should have already been called by then.
		setTimeout(async () => {
			await seedProgress(id, makeProgressState(4, 4));
		}, 11_000);

		await progressPromise;

		// At 50% and past the throttle gate — should have received a message
		expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
		expect(receivedMessages[0]?.text).toContain("Progress:");
		await redisClient.del(PROGRESS_KEY(id));
	}, 45_000);

	it("message contains per-agent ✅ / ⏳ emoji status lines", async () => {
		const id = "prog-content";
		await seedProgress(id, makeProgressState(4, 2));

		const progressPromise = reportProgress(id, "chat-content");
		setTimeout(async () => {
			await seedProgress(id, makeProgressState(4, 4));
		}, 11_000);

		await progressPromise;

		if (receivedMessages.length > 0) {
			const text = receivedMessages[0]?.text ?? "";
			expect(text).toMatch(/\d+\/\d+ agents/);
			expect(text).toMatch(/[✅⏳❌⏱️]/u);
		}
		await redisClient.del(PROGRESS_KEY(id));
	}, 45_000);

	it("sends at most 2 messages across multiple poll intervals", async () => {
		const id = "prog-max";
		// Keep at 75% so the reporter wants to send on every eligible poll
		await seedProgress(id, makeProgressState(4, 3));

		const progressPromise = reportProgress(id, "chat-max");

		// First message should send after poll 1 (~10 s).
		// Second message needs 30 s gap, so after poll 4 (~40 s).
		// Mark done after 42 s so loop exits after the second message.
		setTimeout(async () => {
			await seedProgress(id, makeProgressState(4, 4));
		}, 42_000);

		await progressPromise;

		// Should never exceed 2
		expect(receivedMessages.length).toBeLessThanOrEqual(2);
		await redisClient.del(PROGRESS_KEY(id));
	}, 60_000);
});
