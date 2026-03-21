#!/usr/bin/env node

// Thin wrapper that spawns tsx to run the TypeScript CLI.
// This exists because npm/pnpm bin scripts run with plain Node,
// which can't handle TypeScript + path aliases directly.

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");
const cliPath = resolve(projectDir, "src", "cli.ts");

try {
	execFileSync("pnpm", ["tsx", "--env-file=.env", cliPath, ...process.argv.slice(2)], {
		cwd: projectDir,
		stdio: "inherit",
	});
} catch (err) {
	process.exit(err.status ?? 1);
}
