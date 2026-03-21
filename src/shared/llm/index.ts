import { createGeminiClient } from "./gemini.js";
import { createOpenAIClient } from "./openai.js";
import type { LlmClient, LlmProvider } from "./types.js";

export type {
	LlmClient,
	LlmProvider,
	LlmRequest,
	LlmResponse,
} from "./types.js";

/**
 * Create an LLM client based on the `LLM_PROVIDER` env var (default: "gemini").
 *
 * - `gemini` — uses Gemini REST API (same as Step 3 cv-parser)
 * - `openai` — uses OpenAI SDK (supports any OpenAI-compatible API via OPENAI_BASE_URL)
 */
export function createLlmClient(provider?: LlmProvider): LlmClient {
	const resolved =
		provider ??
		(process.env.LLM_PROVIDER as LlmProvider | undefined) ??
		"gemini";

	switch (resolved) {
		case "openai":
			return createOpenAIClient();
		case "gemini":
			return createGeminiClient();
		default:
			throw new Error(
				`Unknown LLM_PROVIDER: "${resolved}". Use "gemini" or "openai".`,
			);
	}
}
