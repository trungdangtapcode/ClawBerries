/**
 * Provider-agnostic LLM interface for structured JSON generation.
 * Supports Gemini (default, matches Step 3 cv-parser) and OpenAI.
 */

export type LlmProvider = "gemini" | "openai";

export interface LlmRequest {
	/** System-level instruction for the LLM */
	systemPrompt: string;
	/** User-level content (the data to analyse) */
	userPrompt: string;
	/** 0.0–2.0, lower = more deterministic. Default: 0.2 */
	temperature?: number;
	/** Abort after this many milliseconds. Default: 60_000 */
	timeoutMs?: number;
	/**
	 * JSON Schema for structured output. When provided:
	 * - Gemini: passed as `responseJsonSchema` in generationConfig
	 * - OpenAI: passed as `response_format.json_schema` with strict: true
	 * Must follow JSON Schema spec with lowercase types.
	 * For OpenAI compatibility: all objects need `additionalProperties: false`
	 * and all properties listed in `required`. Use `["type", "null"]` for nullable.
	 */
	responseSchema?: Record<string, unknown>;
}

export interface LlmResponse<T = unknown> {
	result: T;
	model: string;
	tokensUsed: number;
}

export interface LlmClient {
	readonly provider: LlmProvider;
	readonly model: string;

	/**
	 * Send a prompt and receive a parsed JSON response.
	 * The LLM is instructed to return valid JSON only.
	 */
	generateJson<T = unknown>(request: LlmRequest): Promise<LlmResponse<T>>;
}
