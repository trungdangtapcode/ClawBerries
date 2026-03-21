/**
 * Integration tests for the TinyFish SSE client — calls the real API.
 *
 * Requires:
 *   TINYFISH_API_KEY — set in .env or environment
 *
 * Run: pnpm test:integration
 */
import { describe, expect, it } from "vitest";
import { callTinyFish } from "@/modules/research/tinyfish-client.js";

describe("callTinyFish — real TinyFish API", () => {
	it("returns a structured result from a simple extraction goal", async () => {
		const { run_id, result } = await callTinyFish({
			url: "https://example.com",
			goal: "Extract the page title and the main heading text. Return as JSON: { title, heading }",
			browser_profile: "lite",
		});

		expect(typeof run_id).toBe("string");
		expect(run_id.length).toBeGreaterThan(0);
		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	}, 120_000);

	it("works with stealth browser profile on a public page", async () => {
		const { result } = await callTinyFish({
			url: "https://httpbin.org/json",
			goal: 'Fetch this JSON API endpoint and return the value of the "slideshow" key as-is.',
			browser_profile: "stealth",
		});

		expect(result).toBeDefined();
	}, 120_000);

	it("returns error info in result for an unresolvable domain (TinyFish does not fail)", async () => {
		// TinyFish completes with status COMPLETED but includes error details in the result
		const { result } = await callTinyFish({
			url: "https://this-domain-does-not-exist-xyz-123456.invalid",
			goal: "Extract any text",
			browser_profile: "lite",
		});

		// TinyFish returns an error description somewhere in the result
		const resultStr = JSON.stringify(result).toLowerCase();
		expect(resultStr).toMatch(
			/error|fail|invalid|domain|unavailable|could not/i,
		);
	}, 120_000);

	it("respects AbortController signal", async () => {
		const controller = new AbortController();
		// Abort after 500ms — well before TinyFish finishes
		setTimeout(() => controller.abort(), 500);

		await expect(
			callTinyFish(
				{
					url: "https://example.com",
					goal: "Extract everything on the page",
					browser_profile: "lite",
				},
				controller.signal,
			),
		).rejects.toThrow();
	}, 10_000);
});
