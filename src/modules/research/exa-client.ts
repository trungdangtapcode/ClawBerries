import Exa from "exa-js";
import { config } from "@/shared/config/env.js";
import type { ResearchRequest, ResearchResult } from "./research-client.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract hostname from a URL for use as includeDomains filter.
 * Returns null if the URL is a generic search engine (Google, Bing, DuckDuckGo).
 */
function extractTargetDomain(url: string): string | null {
	const GENERIC_SEARCH_ENGINES = ["google.com", "bing.com", "duckduckgo.com", "yahoo.com"];
	try {
		const { hostname } = new URL(url);
		const isGeneric = GENERIC_SEARCH_ENGINES.some((d) => hostname.endsWith(d));
		return isGeneric ? null : hostname;
	} catch {
		return null;
	}
}

// ─── Main client ──────────────────────────────────────────────────────────────

/**
 * Call Exa search as a drop-in alternative to TinyFish.
 *
 * - If the target URL is a specific site (LinkedIn, GitHub, portfolio...),
 *   restricts the search to that domain via `includeDomains`.
 * - Uses `searchAndContents` with LLM summaries so downstream agents get
 *   structured natural-language summaries, same as TinyFish result.summary.
 * - AbortSignal is respected: throws AbortError if cancelled before the
 *   fetch resolves.
 */
export async function callExa(
	request: ResearchRequest,
	signal?: AbortSignal,
): Promise<ResearchResult> {
	const apiKey = config.EXA_API_KEY;
	if (!apiKey) throw new Error("Missing EXA_API_KEY.");

	const exa = new Exa(apiKey);

	const targetDomain = extractTargetDomain(request.url);

	// Abort check before the network call
	signal?.throwIfAborted?.();

	const response = await exa.searchAndContents(request.goal, {
		numResults: 3,
		type: "auto",
		...(targetDomain ? { includeDomains: [targetDomain] } : {}),
		text: { maxCharacters: 500 },
		summary: { query: request.goal },
	});

	// Abort check after the network call (in case signal fired during await)
	signal?.throwIfAborted?.();

	const results = response.results.map((r) => ({
		url: r.url,
		title: r.title ?? null,
		publishedDate: r.publishedDate ?? null,
		summary: r.summary ?? null,
		text: r.text ?? null,
	}));

	const summary = results
		.filter((r) => r.summary)
		.map((r) => `[${r.title ?? r.url}] ${r.summary}`)
		.join("\n");

	return {
		run_id: `exa-${Date.now()}`,
		result: {
			provider: "exa",
			query: request.goal,
			targetDomain,
			results,
			summary: summary || "No results found.",
		},
	};
}
