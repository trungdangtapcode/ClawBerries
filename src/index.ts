import { config } from "@/shared/config/env.js";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { processPdfWithGemini } from "@/modules/parser/index.js";
import { planAndDispatchAgents, previewAgentTargets } from "@/modules/parser/index.js";

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
		process.stdout.write(`[step 3] Parsing CV: ${pdfPath}\n`);
		const ocrResult = await processPdfWithGemini(pdfPath, "Extract all structured data from this CV.");
		process.stdout.write(`[step 3] Done — extracted ${ocrResult.identity.fullName}\n`);

		process.stdout.write(`[step 4] Planning and dispatching agents (requestId: ${requestId})\n`);
		const agents = await planAndDispatchAgents(requestId, ocrResult);
		const preview = previewAgentTargets(ocrResult);
		process.stdout.write(`[step 4] Dispatched ${agents.length} agents:\n`);
		process.stdout.write(`${JSON.stringify(preview.map((item) => ({ type: item.agentType, url: item.targetUrl, check: item.prompt })), null, 2)}\n`);
	})().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
}
