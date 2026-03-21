import OpenAI from "openai";
import type { ResponseFormatJSONSchema } from "openai/resources/shared.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TIMEOUT_MS = 60_000;

export function createOpenAIClient(opts?: {
	apiKey?: string;
	model?: string;
	baseUrl?: string;
}): LlmClient {
	const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
	const model = opts?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
	const baseURL = opts?.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined;

	if (!apiKey) {
		throw new Error(
			"Missing OPENAI_API_KEY — required for OpenAI LLM provider.",
		);
	}

	const client = new OpenAI({ apiKey, baseURL });

	return {
		provider: "openai",
		model,

		async generateJson<T>(request: LlmRequest): Promise<LlmResponse<T>> {
			const timeout = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

			// Use strict json_schema when a schema is provided, otherwise json_object
			const responseFormat: OpenAI.ChatCompletionCreateParams["response_format"] =
				request.responseSchema
					? {
							type: "json_schema",
							json_schema: {
								name: "candidate_brief",
								schema: request.responseSchema,
								strict: true,
							},
						} as ResponseFormatJSONSchema
					: { type: "json_object" };

			const completion = await client.chat.completions.create(
				{
					model,
					temperature: request.temperature ?? 0.2,
					response_format: responseFormat,
					messages: [
						{ role: "system", content: request.systemPrompt },
						{ role: "user", content: request.userPrompt },
					],
				},
				{ timeout },
			);

			const text = completion.choices[0]?.message?.content?.trim();
			if (!text) {
				throw new Error("OpenAI returned empty content.");
			}

			const parsed = JSON.parse(text) as T;

			return {
				result: parsed,
				model: completion.model ?? model,
				tokensUsed: completion.usage?.total_tokens ?? 0,
			};
		},
	};
}
