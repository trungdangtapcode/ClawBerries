import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't load .env automatically — load it manually
try {
	const lines = readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
		if (key && !(key in process.env)) process.env[key] = value;
	}
} catch { /* .env is optional */ }

export default defineConfig({
	out: "./drizzle",
	schema: "./src/shared/db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
