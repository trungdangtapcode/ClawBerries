import type { ResearchRequest, ResearchResult } from "./research-client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeminiGroundingChunk {
	web?: { uri: string; title: string };
}

interface GeminiCandidate {
	content?: { parts?: Array<{ text?: string }> };
	groundingMetadata?: {
		webSearchQueries?: string[];
		groundingChunks?: GeminiGroundingChunk[];
	};
}

interface GeminiResponse {
	candidates?: GeminiCandidate[];
	promptFeedback?: { blockReason?: string };
}

// ─── Main client ──────────────────────────────────────────────────────────────

/**
 * Call Gemini with Google Search grounding as a drop-in alternative to TinyFish.
 *
 * Uses `googleSearchRetrieval` which supports `dynamicRetrievalConfig`:
 *  - MODE_UNSPECIFIED (default): always trigger Google Search — most thorough.
 *  - MODE_DYNAMIC + dynamicThreshold: Gemini only searches when its prediction
 *    score ≥ threshold (0.0 = always, 1.0 = almost never).
 *    Controlled via GOOGLE_SEARCH_DYNAMIC_THRESHOLD in .env.
 *
 * Reuses GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL from existing env.
 */
export async function callGoogleSearch(
	request: ResearchRequest,
	signal?: AbortSignal,
): Promise<ResearchResult> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

	const baseURL = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
	const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

	const prompt = `You are a research assistant. Using Google Search, answer the following research task and return a JSON object.

Research task:
${request.goal}

Context URL (the primary source to investigate): ${request.url}

Return a JSON object with this structure:
{
  "summary": "<concise summary of findings>",
  "findings": ["<finding 1>", "<finding 2>", ...],
  "sources": ["<url 1>", "<url 2>", ...]
}`;

	const endpoint = `${baseURL}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			tools: [{ google_search: {} }],
			generationConfig: { temperature: 1.0 },
		}),
		signal,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Gemini Google Search error (${response.status}): ${body}`);
	}

	const json = (await response.json()) as GeminiResponse;

	if (json.promptFeedback?.blockReason) {
		throw new Error(`Gemini blocked request: ${json.promptFeedback.blockReason}`);
	}

	const candidate = json.candidates?.[0];
	const rawText = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
	const grounding = candidate?.groundingMetadata;

	// Parse JSON from Gemini response (strip markdown fences if present)
	let parsed: Record<string, unknown> = {};
	try {
		const cleaned = rawText
			.replace(/^```json\s*/i, "")
			.replace(/^```\s*/i, "")
			.replace(/\s*```$/, "")
			.trim();
		parsed = JSON.parse(cleaned) as Record<string, unknown>;
	} catch {
		// Gemini didn't return valid JSON — wrap raw text
		parsed = { summary: rawText };
	}

	return {
		run_id: `google-${Date.now()}`,
		result: {
			provider: "google",
			model,
			webSearchQueries: grounding?.webSearchQueries ?? [],
			groundingSources: (grounding?.groundingChunks ?? [])
				.filter((c) => c.web)
				.map((c) => ({ title: c.web!.title, url: c.web!.uri })),
			...parsed,
		},
	};
}
