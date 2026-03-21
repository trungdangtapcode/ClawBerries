import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { processPdfWithGemini } from "@/modules/parser/index.js";
import { previewAgentTargets } from "@/modules/parser/dispatcher.js";
import { runResearch } from "@/modules/research/run-research.js";
import { reportProgress } from "@/modules/research/progress.js";
import { synthesize } from "@/modules/synthesis/synthesizer.js";
import { db, schema } from "@/shared/db/index.js";
import { config } from "@/shared/config/env.js";

// ─── Subcommand: run ─────────────────────────────────────────────────────────

async function cmdRun(cvPath: string): Promise<void> {
	const absolutePath = resolve(cvPath);

	// Step 3: Parse CV
	process.stdout.write(`[step 3] Parsing CV: ${absolutePath}\n`);
	const ocrResult = await processPdfWithGemini(
		absolutePath,
		"Extract all structured data from this CV.",
	);
	process.stdout.write(`[step 3] Done — ${ocrResult.identity.fullName}\n`);

	// Step 4: Plan agents
	const items = previewAgentTargets(ocrResult);
	process.stdout.write(`[step 4] Planned ${items.length} agents\n`);

	// Create request record
	const [row] = await db
		.insert(schema.researchRequests)
		.values({
			telegramChatId: config.TELEGRAM_HR_CHAT_ID ?? "cli",
			status: "parsing",
			originalFileName: cvPath.split("/").pop() ?? null,
			fileStoragePath: absolutePath,
		})
		.returning({ id: schema.researchRequests.id });

	const requestId = row!.id;
	process.stdout.write(`[run] Request ID: ${requestId}\n`);

	// Steps 5+6: Research (async — don't wait)
	const chatId = config.TELEGRAM_HR_CHAT_ID ?? "";

	// Run pipeline in background
	Promise.all([
		runResearch(requestId, items),
		reportProgress(requestId, chatId),
	])
		.then(async () => {
			// Step 7: Synthesis
			try {
				await synthesize(requestId, ocrResult);
				await db
					.update(schema.researchRequests)
					.set({ status: "delivered", completedAt: new Date() })
					.where(eq(schema.researchRequests.id, requestId));
			} catch (err) {
				console.error("[run] Synthesis failed:", err);
				await db
					.update(schema.researchRequests)
					.set({ status: "failed", completedAt: new Date() })
					.where(eq(schema.researchRequests.id, requestId));
			}
		})
		.catch(async (err) => {
			console.error("[run] Pipeline failed:", err);
			await db
				.update(schema.researchRequests)
				.set({ status: "failed", completedAt: new Date() })
				.where(eq(schema.researchRequests.id, requestId))
				.catch(() => {}); // best-effort DB update
		});

	// Return immediately
	process.stdout.write(JSON.stringify({ requestId }) + "\n");
}

// ─── Subcommand: status ──────────────────────────────────────────────────────

async function cmdStatus(requestId: string): Promise<void> {
	const rows = await db
		.select()
		.from(schema.researchRequests)
		.where(eq(schema.researchRequests.id, requestId));

	if (rows.length === 0) {
		process.stdout.write(JSON.stringify({ error: "Request not found" }) + "\n");
		process.exit(1);
	}

	const request = rows[0]!;

	const agents = await db
		.select()
		.from(schema.agentResults)
		.where(eq(schema.agentResults.requestId, requestId));

	const completed = agents.filter((a) => a.status === "completed").length;
	const failed = agents.filter((a) => a.status === "failed").length;
	const timedOut = agents.filter((a) => a.status === "timeout").length;
	const running = agents.filter((a) => a.status === "running").length;

	process.stdout.write(
		JSON.stringify({
			requestId,
			status: request.status,
			agents: {
				total: agents.length,
				completed,
				failed,
				timedOut,
				running,
			},
			requestedAt: request.requestedAt,
			completedAt: request.completedAt,
		}, null, 2) + "\n",
	);
}

// ─── Subcommand: report ──────────────────────────────────────────────────────

async function cmdReport(requestId: string): Promise<void> {
	const rows = await db
		.select()
		.from(schema.candidateBriefs)
		.where(eq(schema.candidateBriefs.requestId, requestId));

	if (rows.length === 0) {
		process.stdout.write(
			JSON.stringify({ error: "No report found. Pipeline may still be running — check status first." }) + "\n",
		);
		process.exit(1);
	}

	const brief = rows[0]!;
	process.stdout.write(
		JSON.stringify({
			requestId,
			overallRating: brief.overallRating,
			briefMarkdown: brief.briefMarkdown,
			inconsistenciesCount: brief.inconsistenciesCount,
			verifiedClaimsCount: brief.verifiedClaimsCount,
			interviewQuestions: brief.interviewQuestions,
			modelUsed: brief.modelUsed,
			tokensUsed: brief.tokensUsed,
			createdAt: brief.createdAt,
		}, null, 2) + "\n",
	);
}

// ─── Subcommand: cancel ──────────────────────────────────────────────────────

async function cmdCancel(requestId: string): Promise<void> {
	// Mark any running agents as cancelled in DB
	const agents = await db
		.select()
		.from(schema.agentResults)
		.where(eq(schema.agentResults.requestId, requestId));

	let cancelledCount = 0;
	for (const agent of agents) {
		if (agent.status === "running" || agent.status === "pending") {
			await db
				.update(schema.agentResults)
				.set({ status: "timeout", errorMessage: "cancelled by user", completedAt: new Date() })
				.where(eq(schema.agentResults.id, agent.id));
			cancelledCount++;
		}
	}

	// Mark the request as failed
	await db
		.update(schema.researchRequests)
		.set({ status: "failed", completedAt: new Date() })
		.where(eq(schema.researchRequests.id, requestId));

	process.stdout.write(JSON.stringify({ requestId, cancelled: true, agentsCancelled: cancelledCount }) + "\n");
}

// ─── Subcommand: install-skill ───────────────────────────────────────────────

async function cmdInstallSkill(): Promise<void> {
	const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
	const { join } = await import("node:path");
	const { homedir } = await import("node:os");

	const projectDir = process.cwd();
	const src = join(projectDir, "docs", "openclaw-skill", "SKILL.md");
	const destDir = join(homedir(), ".openclaw", "skills", "clawberries");
	const dest = join(destDir, "SKILL.md");

	// Read template and replace placeholder with actual project path
	let content = readFileSync(src, "utf-8");
	content = content.replace(/__CLAWBERRIES_DIR__/g, projectDir);

	mkdirSync(destDir, { recursive: true });
	writeFileSync(dest, content);

	process.stdout.write(`Installed ClawBerries skill to ${dest}\n`);
	process.stdout.write(`Project path set to: ${projectDir}\n`);
	process.stdout.write("Restart OpenClaw to pick it up: openclaw gateway restart\n");
}

// ─── Router ──────────────────────────────────────────────────────────────────

export async function runCli(args: string[]): Promise<void> {
	const command = args[0];

	switch (command) {
		case "run": {
			const cvPath = args[1];
			if (!cvPath) {
				process.stderr.write("Usage: clawberries run <path-to-cv.pdf>\n");
				process.exit(1);
			}
			await cmdRun(cvPath);
			break;
		}
		case "status": {
			const id = args[1];
			if (!id) {
				process.stderr.write("Usage: clawberries status <requestId>\n");
				process.exit(1);
			}
			await cmdStatus(id);
			break;
		}
		case "report": {
			const id = args[1];
			if (!id) {
				process.stderr.write("Usage: clawberries report <requestId>\n");
				process.exit(1);
			}
			await cmdReport(id);
			break;
		}
		case "cancel": {
			const id = args[1];
			if (!id) {
				process.stderr.write("Usage: clawberries cancel <requestId>\n");
				process.exit(1);
			}
			await cmdCancel(id);
			break;
		}
		case "serve": {
			const { startServer } = await import("./webhook.js");
			startServer();
			break;
		}
		case "install-skill": {
			await cmdInstallSkill();
			break;
		}
		default:
			process.stderr.write(
				[
					"ClawBerries — Job Applicant Research Agent",
					"",
					"Usage: clawberries <command> [args]",
					"",
					"Commands:",
					"  run <cv.pdf>        Trigger full verification pipeline, returns requestId",
					"  status <requestId>  Check pipeline progress",
					"  report <requestId>  Get the final candidate brief",
					"  cancel <requestId>  Cancel a running pipeline",
					"  serve               Start webhook server for Google Form submissions",
					"  install-skill       Install the OpenClaw skill to ~/.openclaw/skills/",
					"",
				].join("\n"),
			);
			process.exit(command ? 1 : 0);
	}
}
