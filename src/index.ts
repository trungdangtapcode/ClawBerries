import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
	planAndDispatchAgents,
	previewAgentTargets,
	processPdfWithGemini,
} from "@/modules/parser/index.js";
import { reportProgress } from "@/modules/research/progress.js";
import { runResearch } from "@/modules/research/run-research.js";
import { synthesize } from "@/modules/synthesis/synthesizer.js";
import { config } from "@/shared/config/env.js";
import { db, schema } from "@/shared/db/index.js";

console.log(`ClawBerries starting in ${config.NODE_ENV} mode...`);

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
	const pdfPath = process.argv[2];
	if (!pdfPath) {
		process.stderr.write("Missing required argument: <path-to-pdf>\n");
		process.exit(1);
	}

	(async () => {
		const requestId = randomUUID();

		// ── Step 3: Parse CV with Gemini ──────────────────────────────────────
		process.stdout.write(`[step 3] Parsing CV: ${pdfPath}\n`);
		const ocrResult = await processPdfWithGemini(
			pdfPath,
			"Extract all structured data from this CV.",
		);
		process.stdout.write(
			`[step 3] Done — extracted ${ocrResult.identity.fullName}\n`,
		);

		// ── Step 4: Plan agents from PdfOcrResult ─────────────────────────────
		process.stdout.write(
			`[step 4] Planning agents (requestId: ${requestId})\n`,
		);
		await planAndDispatchAgents(requestId, ocrResult); // applies rate limits, logs warnings
		const items = previewAgentTargets(ocrResult); // pure plan — carries url+goal+browserProfile
		process.stdout.write(`[step 4] Planned ${items.length} agents:\n`);
		process.stdout.write(
			`${JSON.stringify(
				items.map((item, i) => ({
					_meta: { index: i, agentType: item.agentType, target: item.target, timeoutMs: item.timeout },
					tinyfish_request: {
						url: item.targetUrl,
						goal: item.prompt,
						browser_profile: item.browserProfile,
					},
				})),
				null,
				2,
			)}\n`,
		);

		// ── Steps 5 + 6: Research + Progress reporting (concurrent) ───────────
		process.stdout.write(
			"[step 5+6] Starting parallel research and progress reporting...\n",
		);

		const [row] = await db
			.insert(schema.researchRequests)
			.values({ telegramChatId: "cli", status: "parsing" })
			.returning({ id: schema.researchRequests.id });

		const chatId = config.TELEGRAM_BOT_TOKEN ? "cli" : "";

		await Promise.all([
			runResearch(row!.id, items),
			reportProgress(row!.id, chatId),
		]);

		process.stdout.write("[step 5+6] Research complete.\n");

		// ── Step 7: LLM Synthesis & Cross-Referencing ────────────────────────
		process.stdout.write("[step 7] Starting LLM synthesis...\n");
		const brief = await synthesize(row!.id, ocrResult);
		process.stdout.write(`[step 7] Done — ${brief.overallRating.toUpperCase()}\n`);
		process.stdout.write(`\n${JSON.stringify(brief, null, 2)}\n`);
	})().catch((error: unknown) => {
		if (error instanceof Error) {
			process.stderr.write(`${error.message}\n${error.stack}\n`);
		} else {
			process.stderr.write(`${String(error)}\n`);
		}
		process.exit(1);
	});
}
