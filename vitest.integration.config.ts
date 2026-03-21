import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for integration tests.
 * Run with: pnpm test:integration
 *
 * Prerequisites: docker-compose up -d (Postgres + Redis must be running)
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		globalSetup: ["src/modules/research/__integration__/setup.ts"],
		include: ["src/**/__integration__/**/*.test.ts"],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		// Run integration test files sequentially — they share real infra
		fileParallelism: false,
	},
});
