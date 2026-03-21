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

// ─── Result normalization ─────────────────────────────────────────────────────

/**
 * Ensure provider-native results carry a `summary` field that downstream
 * code (research-bundle serializer, progress updates) can rely on.
 * TinyFish already returns `summary`; Exa and Google may use different keys.
 */
function normalizeResult(raw: ResearchResult): ResearchResult {
	const r = raw.result;

	// Guarantee a top-level `summary` string
	if (typeof r.summary !== "string") {
		if (typeof r.findings === "object" && Array.isArray(r.findings)) {
			r.summary = (r.findings as string[]).join("; ");
		} else {
			r.summary = "";
		}
	}

	return raw;
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/**
 * Call the configured research provider (RESEARCH_PROVIDER env var).
 *
 * - "tinyfish" (default): browser automation via TinyFish SSE
 * - "exa":    neural web search via Exa SDK
 * - "google": Gemini + Google Search grounding
 *
 * Results are normalized so downstream code can rely on a consistent shape
 * (e.g. `result.summary` always exists as a string).
 */
export async function callResearchAgent(
	request: ResearchRequest,
	signal?: AbortSignal,
): Promise<ResearchResult> {
	let raw: ResearchResult;
	switch (config.RESEARCH_PROVIDER) {
		case "exa":
			raw = await callExa(request, signal);
			break;
		case "google":
			raw = await callGoogleSearch(request, signal);
			break;
		default:
			raw = await callTinyFish(request, signal);
			break;
	}
	return normalizeResult(raw);
}
