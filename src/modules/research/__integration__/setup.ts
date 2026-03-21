import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal .env loader — avoids adding a dotenv dependency */
function loadDotenv(): void {
	try {
		const envPath = resolve(process.cwd(), ".env");
		const lines = readFileSync(envPath, "utf8").split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			const value = trimmed
				.slice(eqIdx + 1)
				.trim()
				.replace(/^["']|["']$/g, "");
			// Only set if not already defined in environment
			if (key && !(key in process.env)) {
				process.env[key] = value;
			}
		}
	} catch {
		// No .env file — that is fine in CI
	}
}

/**
 * Vitest global setup for integration tests.
 * This file runs BEFORE any test module is imported, so env vars set here
 * will be picked up by ESM singletons like `config` in env.ts.
 *
 * Referenced in vitest.integration.config.ts via `globalSetup`.
 */
export async function setup(): Promise<void> {
	loadDotenv();
	// These must be set before any test file imports modules that read process.env at load time
	process.env.NODE_ENV = "test";
	// TINYFISH_API_KEY is read from .env — do not override here
	process.env.TELEGRAM_BOT_TOKEN =
		process.env.TELEGRAM_BOT_TOKEN ?? "test-token-integration";
	process.env.DATABASE_URL =
		process.env.DATABASE_URL ??
		"postgres://clawberries:clawberries@localhost:5432/clawberries";
	process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
}
