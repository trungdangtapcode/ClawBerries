import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod/v4";

function loadDotenv(): void {
	try {
		const envPath = resolve(process.cwd(), ".env");
		const lines = readFileSync(envPath, "utf8").split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			const eqIndex = trimmed.indexOf("=");
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex).trim();
			const value = trimmed
				.slice(eqIndex + 1)
				.trim()
				.replace(/^["']|["']$/g, "");

			// Keep explicit shell exports higher priority than .env
			if (key && !(key in process.env)) {
				process.env[key] = value;
			}
		}
	} catch {
		// .env is optional in CI/production
	}
}

loadDotenv();

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(3000),

	// PostgreSQL
	DATABASE_URL: z
		.url()
		.default("postgres://clawberries:clawberries@localhost:5432/clawberries"),

	// Redis
	REDIS_URL: z.string().default("redis://localhost:6379"),

	// Telegram
	TELEGRAM_BOT_TOKEN: z.string().optional(),
	TELEGRAM_HR_CHAT_ID: z.string().optional(),

	// LLM
	ANTHROPIC_API_KEY: z.string().optional(),

	// External APIs
	GITHUB_TOKEN: z.string().optional(),
	SERPAPI_KEY: z.string().optional(),
	BRIGHTDATA_API_KEY: z.string().optional(),

	// TinyFish
	TINYFISH_API_KEY: z.string().optional(),

	// Exa
	EXA_API_KEY: z.string().optional(),

	GEMINI_API_KEY: z.string().optional(),
	// Google Search (via Gemini grounding) — reuses GEMINI_API_KEY / GEMINI_MODEL
	// dynamicThreshold: 0.0 = always search, 1.0 = almost never search.
	// If unset, MODE_UNSPECIFIED is used (always search, most thorough).
	GOOGLE_SEARCH_DYNAMIC_THRESHOLD: z.coerce.number().min(0).max(1).optional(),

	// Research provider: "tinyfish" | "exa" | "google" (default: tinyfish)
	RESEARCH_PROVIDER: z.enum(["tinyfish", "exa", "google"]).default("tinyfish"),

	RESEARCH_TIMEOUT_MS: z.coerce.number().default(300_000),
});

export type Env = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);
