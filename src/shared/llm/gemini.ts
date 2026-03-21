import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";

type GeminiResponse = {
	candidates?: Array<{
		content?: { parts?: Array<{ text?: string }> };
	}>;
	usageMetadata?: {
		totalTokenCount?: number;
	};
	promptFeedback?: { blockReason?: string };
};

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 60_000;

export function createGeminiClient(opts?: {
	apiKey?: string;
	model?: string;
	baseUrl?: string;
}): LlmClient {
	const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
	const model = opts?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
	const baseUrl =
		opts?.baseUrl ?? process.env.GEMINI_BASE_URL ?? DEFAULT_BASE_URL;

	if (!apiKey) {
		throw new Error(
			"Missing GEMINI_API_KEY — required for Gemini LLM provider.",
		);
	}

	return {
		provider: "gemini",
		model,

		async generateJson<T>(request: LlmRequest): Promise<LlmResponse<T>> {
			const controller = new AbortController();
			const timeout = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const timer = setTimeout(() => controller.abort(), timeout);

			try {
				const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

				const generationConfig: Record<string, unknown> = {
					responseMimeType: "application/json",
					temperature: request.temperature ?? 0.2,
				};

				// Use Gemini's responseJsonSchema for structured output when schema is provided
				if (request.responseSchema) {
					generationConfig.responseJsonSchema = request.responseSchema;
				}

				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [
							{
								role: "user",
								parts: [
									{ text: `${request.systemPrompt}\n\n${request.userPrompt}` },
								],
							},
						],
						generationConfig,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const body = await response.text();
					throw new Error(`Gemini API error (${response.status}): ${body}`);
				}

				const json = (await response.json()) as GeminiResponse;

				if (json.promptFeedback?.blockReason) {
					throw new Error(
						`Gemini blocked request: ${json.promptFeedback.blockReason}`,
					);
				}

				const text = json.candidates?.[0]?.content?.parts
					?.map((p) => p.text ?? "")
					.join("")
					.trim();

				if (!text) {
					throw new Error("Gemini returned empty content.");
				}

				const cleaned = text
					.replace(/^```json\s*/i, "")
					.replace(/^```\s*/i, "")
					.replace(/\s*```$/, "")
					.trim();

				const parsed = JSON.parse(cleaned) as T;
				const result = Array.isArray(parsed) ? (parsed[0] as T) : parsed;

				return {
					result,
					model,
					tokensUsed: json.usageMetadata?.totalTokenCount ?? 0,
				};
			} catch (err) {
				if (
					err instanceof Error &&
					(err.name === "AbortError" || err.message.includes("aborted"))
				) {
					throw new Error(`Gemini request timed out after ${timeout}ms.`);
				}
				throw err;
			} finally {
				clearTimeout(timer);
			}
		},
	};
}
