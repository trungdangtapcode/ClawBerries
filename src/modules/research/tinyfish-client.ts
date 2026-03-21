import { config } from "@/shared/config/env.js";

const TINYFISH_BASE_URL = "https://agent.tinyfish.ai";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BrowserProfile = "lite" | "stealth";

export interface TinyFishRequest {
	/** Starting URL for the browser agent */
	url: string;
	/** Natural-language goal — what to extract / do */
	goal: string;
	/** "lite" for plain REST/API pages, "stealth" for bot-protected sites */
	browser_profile?: BrowserProfile;
}

interface SseEvent {
	type: "STARTED" | "STREAMING_URL" | "PROGRESS" | "COMPLETE" | "HEARTBEAT";
	run_id?: string;
	status?: "COMPLETED" | "FAILED";
	result?: Record<string, unknown>;
	error?: { message: string } | null;
	purpose?: string;
}

export interface TinyFishResult {
	run_id: string;
	result: Record<string, unknown>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class TinyFishError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly runId?: string,
	) {
		super(message);
		this.name = "TinyFishError";
	}
}

// ─── SSE parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Server-Sent Events (SSE) response body and yield each event object.
 * SSE format: "data: <JSON>\n\n"
 */
async function* parseSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Split on double-newline (SSE message boundary)
			const parts = buffer.split("\n\n");
			// The last element may be an incomplete message
			buffer = parts.pop() ?? "";

			for (const part of parts) {
				for (const line of part.split("\n")) {
					if (line.startsWith("data: ")) {
						const json = line.slice(6).trim();
						if (json) {
							try {
								yield JSON.parse(json) as SseEvent;
							} catch {
								// Malformed event — skip
							}
						}
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// ─── Main client ──────────────────────────────────────────────────────────────

/**
 * Call the TinyFish `/v1/automation/run-sse` endpoint.
 *
 * Chosen over sync (/v1/automation/run) and async (/v1/automation/run-async)
 * because SSE supports AbortSignal cancellation — critical for per-agent
 * timeouts (30–60 s) used in Step 5.
 *
 * Returns the structured `result` from the COMPLETE event.
 */
export async function callTinyFish(
	request: TinyFishRequest,
	signal?: AbortSignal,
): Promise<TinyFishResult> {
	const url = `${TINYFISH_BASE_URL}/v1/automation/run-sse`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (config.TINYFISH_API_KEY) {
		headers["X-API-Key"] = config.TINYFISH_API_KEY;
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(request),
		signal,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new TinyFishError(response.status, `TinyFish error ${response.status}: ${body}`);
	}

	if (!response.body) {
		throw new TinyFishError(0, "TinyFish returned empty response body");
	}

	// Consume the SSE stream until we get the COMPLETE event
	let runId: string | undefined;

	for await (const event of parseSseStream(response.body)) {
		if (event.run_id && !runId) runId = event.run_id;

		if (event.type === "COMPLETE") {
			if (event.status === "FAILED") {
				throw new TinyFishError(
					0,
					`TinyFish run failed: ${event.error?.message ?? "unknown error"}`,
					runId,
				);
			}
			return {
				run_id: runId ?? event.run_id ?? "",
				result: event.result ?? {},
			};
		}
	}

	// Stream ended without a COMPLETE event
	throw new TinyFishError(0, "TinyFish SSE stream ended without COMPLETE event", runId);
}
