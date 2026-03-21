import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/config/env.js", () => ({
	config: {
		TINYFISH_API_KEY: "test-key",
	},
}));

import { callTinyFish, TinyFishError } from "../tinyfish-client.js";

// ─── SSE response builder ──────────────────────────────────────────────────────

function makeSseBody(events: object[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const chunks = events.map((e) =>
		encoder.encode(`data: ${JSON.stringify(e)}\n\n`),
	);
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

function mockSseResponse(events: object[], status = 200): Response {
	return new Response(makeSseBody(events), {
		status,
		headers: { "Content-Type": "text/event-stream" },
	});
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("callTinyFish", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("POSTs { url, goal, browser_profile } to /v1/automation/run-sse", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockSseResponse([
				{ type: "STARTED", run_id: "run-1" },
				{
					type: "COMPLETE",
					run_id: "run-1",
					status: "COMPLETED",
					result: { ok: true },
				},
			]),
		);
		vi.stubGlobal("fetch", mockFetch);

		await callTinyFish({
			url: "https://example.com",
			goal: "Extract data",
			browser_profile: "lite",
		});

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://agent.tinyfish.ai/v1/automation/run-sse");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body).toEqual({
			url: "https://example.com",
			goal: "Extract data",
			browser_profile: "lite",
		});
	});

	it("sends X-API-Key header when TINYFISH_API_KEY is set", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockSseResponse([
				{ type: "STARTED", run_id: "run-1" },
				{ type: "COMPLETE", run_id: "run-1", status: "COMPLETED", result: {} },
			]),
		);
		vi.stubGlobal("fetch", mockFetch);

		await callTinyFish({ url: "https://example.com", goal: "test" });

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
			"test-key",
		);
	});

	it("returns run_id and result from the COMPLETE event", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				mockSseResponse([
					{ type: "STARTED", run_id: "run-42" },
					{ type: "PROGRESS", run_id: "run-42", purpose: "Navigating page" },
					{
						type: "COMPLETE",
						run_id: "run-42",
						status: "COMPLETED",
						result: { username: "alice" },
					},
				]),
			),
		);

		const { run_id, result } = await callTinyFish({
			url: "https://github.com/alice",
			goal: "get profile",
		});
		expect(run_id).toBe("run-42");
		expect(result).toEqual({ username: "alice" });
	});

	it("throws TinyFishError on non-2xx HTTP response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
		);

		await expect(
			callTinyFish({ url: "https://example.com", goal: "test" }),
		).rejects.toThrow(TinyFishError);
	});

	it("throws TinyFishError when COMPLETE event has status FAILED", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				mockSseResponse([
					{ type: "STARTED", run_id: "run-bad" },
					{
						type: "COMPLETE",
						run_id: "run-bad",
						status: "FAILED",
						error: { message: "Navigation timeout" },
					},
				]),
			),
		);

		await expect(
			callTinyFish({ url: "https://example.com", goal: "test" }),
		).rejects.toThrow(TinyFishError);
	});

	it("throws TinyFishError if stream ends without COMPLETE event", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				mockSseResponse([
					{ type: "STARTED", run_id: "run-cut" },
					{ type: "PROGRESS", purpose: "doing something" },
					// stream ends here without COMPLETE
				]),
			),
		);

		await expect(
			callTinyFish({ url: "https://example.com", goal: "test" }),
		).rejects.toThrow(TinyFishError);
	});

	it("forwards AbortSignal to fetch", async () => {
		const controller = new AbortController();
		const mockFetch = vi.fn().mockResolvedValue(
			mockSseResponse([
				{ type: "STARTED", run_id: "r" },
				{ type: "COMPLETE", run_id: "r", status: "COMPLETED", result: {} },
			]),
		);
		vi.stubGlobal("fetch", mockFetch);

		await callTinyFish(
			{ url: "https://example.com", goal: "test" },
			controller.signal,
		);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(init.signal).toBe(controller.signal);
	});
});
