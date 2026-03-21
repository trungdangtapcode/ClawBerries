import { config } from "@/shared/config/env.js";
import type { BrowserProfile } from "./tinyfish-client.js";
import { callTinyFish } from "./tinyfish-client.js";
import { callExa } from "./exa-client.js";
import { callGoogleSearch } from "./google-client.js";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface ResearchRequest {
	url: string;
	goal: string;
	browser_profile?: BrowserProfile;
}

export interface ResearchResult {
	run_id: string;
	result: Record<string, unknown>;
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/**
 * Call the configured research provider (RESEARCH_PROVIDER env var).
 *
 * - "tinyfish" (default): browser automation via TinyFish SSE
 * - "exa":    neural web search via Exa SDK
 * - "google": Gemini + Google Search grounding
 */
export async function callResearchAgent(
	request: ResearchRequest,
	signal?: AbortSignal,
): Promise<ResearchResult> {
	switch (config.RESEARCH_PROVIDER) {
		case "exa":
			return callExa(request, signal);
		case "google":
			return callGoogleSearch(request, signal);
		default:
			return callTinyFish(request, signal);
	}
}
