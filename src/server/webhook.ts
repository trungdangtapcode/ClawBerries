import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { config } from "@/shared/config/env.js";
import { db, schema } from "@/shared/db/index.js";
import { sendMessage, answerCallbackQuery, editMessage, getHrChatId } from "./telegram.js";

// ─── Types ───────────────────────────────────────────────────────────────────

// Google Form payload (from Apps Script)
interface GFormPayload {
	source: string;
	submittedAt: string;
	applicant: {
		fullName: string;
		email: string;
		position: string;
	};
	cv: {
		driveFileId: string | null;
		downloadUrl: string | null;
		fileName: string | null;
	};
}

// Tally payload
interface TallyField {
	key: string;
	label: string;
	type: string;
	value: unknown;
}

interface TallyFileValue {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	size: number;
}

interface TallyPayload {
	eventId: string;
	eventType: string;
	data: {
		responseId: string;
		formName: string;
		fields: TallyField[];
	};
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_DIR = resolve(process.cwd(), "storage");

async function downloadPdf(url: string, originalFileName: string): Promise<string> {
	await mkdir(STORAGE_DIR, { recursive: true });
	const fileId = randomUUID();
	const filePath = join(STORAGE_DIR, `${fileId}.pdf`);

	const res = await fetch(url, { redirect: "follow" });
	if (!res.ok) {
		throw new Error(`Failed to download CV: ${res.status} ${res.statusText}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	await writeFile(filePath, buffer);
	console.log(`[download] ${originalFileName} → ${filePath} (${buffer.length} bytes)`);
	return filePath;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findTallyField(fields: TallyField[], label: string): TallyField | undefined {
	return fields.find((f) => f.label.toLowerCase().includes(label.toLowerCase()));
}

async function saveSubmission(fullName: string, email: string, fileName: string | null, storagePath: string, source: string): Promise<string> {
	const [row] = await db
		.insert(schema.formSubmissions)
		.values({ fullName, email, originalFileName: fileName, storagePath, tallyResponseId: source })
		.returning({ id: schema.formSubmissions.id });

	// Write to OpenClaw memory
	await writeOpenClawMemory(fullName, email, storagePath, source);

	return row!.id;
}

async function writeOpenClawMemory(fullName: string, email: string, storagePath: string, source: string): Promise<void> {
	try {
		const memoryDir = join(homedir(), ".openclaw", "workspace", "memory");
		await mkdir(memoryDir, { recursive: true });

		const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
		const memoryFile = join(memoryDir, `${today}.md`);

		// Append to today's memory file
		const timestamp = new Date().toLocaleTimeString("vi-VN");
		const entry = `\n## CV Submission (${timestamp}) — ${source}\n- **Name:** ${fullName}\n- **Email:** ${email}\n- **PDF:** ${storagePath}\n`;

		let existing = "";
		try {
			existing = await readFile(memoryFile, "utf-8");
		} catch {
			existing = `# Memory — ${today}\n`;
		}

		await writeFile(memoryFile, existing + entry);
		console.log(`[openclaw] Memory updated: ${fullName} <${email}>`);
	} catch (err) {
		console.error("[openclaw] Failed to write memory:", err instanceof Error ? err.message : err);
	}
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendNotification(source: string, fullName: string, email: string, fileName: string | null, submissionId: string): Promise<void> {
	try {
		const chatId = getHrChatId();
		const lines = [
			`📥 <b>New Application — ${escapeHtml(source)}</b>`,
			``,
			`👤 <b>Name:</b> ${escapeHtml(fullName)}`,
			`📧 <b>Email:</b> ${escapeHtml(email)}`,
			`📎 <b>CV:</b> ${escapeHtml(fileName ?? "No file")}`,
			``,
			`<i>ID: ${submissionId}</i>`,
		];
		await sendMessage(chatId, lines.join("\n"), [
			[
				{ text: "✅ Verify Now", callback_data: `cb_run:${submissionId}` },
				{ text: "⏭ Skip", callback_data: `cb_skip:${submissionId}` },
			],
			[
				{ text: "📄 View CV", callback_data: `cb_viewcv:${submissionId}` },
			],
		]);
	} catch (err) {
		console.error("[telegram] Notification failed:", err instanceof Error ? err.message : err);
	}
}

// ─── Route: Google Form (/api/applications) ─────────────────────────────────

async function handleGForm(payload: GFormPayload): Promise<{ submissionId: string }> {
	const { applicant, cv } = payload;

	console.log("\n══════ Google Form Webhook ══════");
	console.log(`👤 ${applicant.fullName} | 📧 ${applicant.email} | 💼 ${applicant.position}`);

	if (!applicant.fullName || !applicant.email) {
		console.warn("[warn] Missing name or email, skipping.");
		return { submissionId: "" };
	}

	if (!cv.downloadUrl || !cv.fileName) {
		throw new Error("No CV file attached");
	}

	const cvPath = await downloadPdf(cv.downloadUrl, cv.fileName);
	const submissionId = await saveSubmission(applicant.fullName, applicant.email, cv.fileName, cvPath, "gform");

	console.log(`[db] form_submissions.id = ${submissionId}`);
	await sendNotification("Google Form", applicant.fullName, applicant.email, cv.fileName, submissionId);
	console.log("═════════════════════════════════\n");
	return { submissionId };
}

// ─── Route: Tally (/webhook) ────────────────────────────────────────────────

async function handleTally(payload: TallyPayload): Promise<{ submissionId: string }> {
	console.log("\n══════ Tally Webhook ══════");
	console.log("Event:", payload.eventType, "| Response:", payload.data?.responseId);

	const fields = payload.data.fields;
	const fullName = (findTallyField(fields, "họ và tên")?.value as string)
		?? (findTallyField(fields, "name")?.value as string)
		?? "";
	const email = (findTallyField(fields, "email")?.value as string) ?? "";
	const fileField = findTallyField(fields, "cv");
	const files = (fileField?.value ?? []) as TallyFileValue[];

	console.log(`👤 ${fullName} | 📧 ${email} | 📎 ${files.length} file(s)`);

	if (!fullName || !email) {
		console.warn("[warn] Missing name or email, skipping.");
		return { submissionId: "" };
	}

	let submissionId = "";
	for (const file of files) {
		if (file.mimeType !== "application/pdf") continue;

		const cvPath = await downloadPdf(file.url, file.name);
		submissionId = await saveSubmission(fullName, email, file.name, cvPath, `tally:${payload.data.responseId}`);
		console.log(`[db] form_submissions.id = ${submissionId}`);
		await sendNotification("Tally", fullName, email, file.name, submissionId);
	}

	console.log("═══════════════════════════\n");
	return { submissionId };
}

// ─── Pipeline runner ─────────────────────────────────────────────────────────

function runPipeline(pdfPath: string): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
		const proc = spawn("pnpm", ["tsx", "--env-file=.env", "src/index.ts", pdfPath], {
			cwd: process.cwd(),
			env: { ...process.env, NODE_ENV: "development" },
			shell: true,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			const t = chunk.toString();
			stdout += t;
			process.stdout.write(`[pipeline] ${t}`);
		});

		proc.stderr.on("data", (chunk) => {
			const t = chunk.toString();
			stderr += t;
			process.stderr.write(`[pipeline:err] ${t}`);
		});

		proc.on("close", (code) => {
			resolve(code === 0
				? { ok: true, output: stdout }
				: { ok: false, output: stderr || stdout });
		});

		proc.on("error", (err) => {
			resolve({ ok: false, output: err.message });
		});
	});
}

function extractBriefFromOutput(output: string): Record<string, unknown> | null {
	// Find the last JSON object in output — look for { "candidateName" or { "overall
	const idx = output.lastIndexOf('\n{');
	if (idx === -1) {
		// Try without leading newline
		const idx2 = output.lastIndexOf('{');
		if (idx2 === -1) return null;
		try {
			return JSON.parse(output.slice(idx2)) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	try {
		return JSON.parse(output.slice(idx + 1)) as Record<string, unknown>;
	} catch {
		// Maybe trailing garbage — try to find matching closing brace
		const jsonStr = output.slice(idx + 1);
		const lastBrace = jsonStr.lastIndexOf('}');
		if (lastBrace === -1) return null;
		try {
			return JSON.parse(jsonStr.slice(0, lastBrace + 1)) as Record<string, unknown>;
		} catch {
			console.error("[extract] Failed to parse JSON from output. Last 200 chars:", output.slice(-200));
			return null;
		}
	}
}

function formatBriefForTelegram(brief: Record<string, unknown>): string {
	const rating = (brief.overallRating as string) ?? "unknown";
	const ratingEmoji = rating === "green" ? "🟢" : rating === "red" ? "🔴" : "🟡";
	const name = (brief.candidateName as string) ?? "";
	const summary = (brief.summary as string) ?? "";

	const lines: string[] = [];
	lines.push(`${ratingEmoji} <b>${escapeHtml(name)}</b> — ${rating.toUpperCase()}`);
	lines.push("");
	lines.push(escapeHtml(summary));

	const cv = brief.cvValidity as Record<string, unknown> | undefined;
	if (cv) {
		lines.push("");
		lines.push(`📊 <b>CV Validity:</b> ${cv.score}/100`);
		lines.push(`  Verified: ${cv.verified} | Unverifiable: ${cv.unverifiable} | Contradicted: ${cv.contradicted}`);
	}

	const inconsistencies = brief.inconsistencies as Array<Record<string, unknown>> | undefined;
	if (inconsistencies && inconsistencies.length > 0) {
		lines.push("");
		lines.push(`⚠️ <b>Inconsistencies (${inconsistencies.length}):</b>`);
		for (const inc of inconsistencies.slice(0, 5)) {
			lines.push(`  • [${(inc.severity as string).toUpperCase()}] ${escapeHtml(inc.cvClaim as string)}`);
		}
		if (inconsistencies.length > 5) lines.push(`  ... và ${inconsistencies.length - 5} khác`);
	}

	const questions = brief.interviewQuestions as string[] | undefined;
	if (questions && questions.length > 0) {
		lines.push("");
		lines.push("❓ <b>Câu hỏi phỏng vấn:</b>");
		for (const q of questions.slice(0, 3)) {
			lines.push(`  • ${escapeHtml(q)}`);
		}
	}

	return lines.join("\n");
}

// ─── Telegram callback handler ──────────────────────────────────────────────

interface TelegramUpdate {
	callback_query?: {
		id: string;
		from: { id: number };
		message?: { chat: { id: number }; message_id: number };
		data?: string;
	};
}

async function handleCallbackQuery(update: TelegramUpdate): Promise<void> {
	const cbq = update.callback_query;
	if (!cbq?.data || !cbq.message) return;

	const chatId = String(cbq.message.chat.id);
	const messageId = cbq.message.message_id;
	const [action, submissionId] = cbq.data.split(":");

	if (!submissionId) {
		await answerCallbackQuery(cbq.id, "Invalid callback");
		return;
	}

	// Look up submission
	const rows = await db
		.select()
		.from(schema.formSubmissions)
		.where(eq(schema.formSubmissions.id, submissionId))
		.limit(1);

	const submission = rows[0];

	switch (action) {
		case "cb_run": {
			if (!submission) {
				await answerCallbackQuery(cbq.id, "Submission not found");
				return;
			}

			await answerCallbackQuery(cbq.id, "Starting verification...");
			await editMessage(chatId, messageId,
				`⏳ <b>Verifying:</b> ${escapeHtml(submission.fullName)}\n📧 ${escapeHtml(submission.email)}\n\n⏳ Pipeline running...`,
			);

			console.log(`[verify] Running pipeline for ${submission.fullName} → ${submission.storagePath}`);
			try {
				const { ok, output } = await runPipeline(submission.storagePath);

				if (!ok) {
					await sendMessage(chatId,
						`❌ <b>Pipeline failed</b> for ${escapeHtml(submission.fullName)}\n\n<pre>${escapeHtml(output.slice(-500))}</pre>`,
					);
					break;
				}

				const brief = extractBriefFromOutput(output);
				if (!brief) {
					// Send raw output tail so we can debug
					const tail = output.slice(-1000);
					await sendMessage(chatId,
						`⚠️ <b>Pipeline finished</b> for ${escapeHtml(submission.fullName)} but could not parse brief.\n\n<pre>${escapeHtml(tail)}</pre>`,
					);
					break;
				}

				await sendMessage(chatId, formatBriefForTelegram(brief));
				console.log(`[verify] Done for ${submission.fullName}`);
			} catch (err) {
				console.error(`[verify] Error:`, err);
				await sendMessage(chatId,
					`❌ <b>Error</b> verifying ${escapeHtml(submission.fullName)}: ${escapeHtml(err instanceof Error ? err.message : String(err))}`,
				);
			}
			break;
		}

		case "cb_skip": {
			await answerCallbackQuery(cbq.id, "Skipped");
			await editMessage(chatId, messageId,
				`⏭ <b>Skipped:</b> ${escapeHtml(submission?.fullName ?? submissionId)}`,
			);
			break;
		}

		case "cb_viewcv": {
			if (!submission) {
				await answerCallbackQuery(cbq.id, "Submission not found");
				return;
			}
			await answerCallbackQuery(cbq.id);
			await sendMessage(chatId, [
				`📄 <b>CV Info</b>`,
				``,
				`👤 ${escapeHtml(submission.fullName)}`,
				`📧 ${escapeHtml(submission.email)}`,
				`📎 ${escapeHtml(submission.originalFileName ?? "N/A")}`,
				`📂 <code>${escapeHtml(submission.storagePath)}</code>`,
			].join("\n"));
			break;
		}

		default:
			await answerCallbackQuery(cbq.id, "Unknown action");
	}
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

function parseBody(req: import("node:http").IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString()));
		req.on("error", reject);
	});
}

function jsonResponse(res: import("node:http").ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

export function startServer(port: number = config.PORT): void {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

		// Health check
		if (req.method === "GET" && url.pathname === "/health") {
			jsonResponse(res, 200, { status: "ok" });
			return;
		}

		// Google Form webhook
		if (req.method === "POST" && url.pathname === "/api/applications") {
			try {
				const body = await parseBody(req);
				const payload = JSON.parse(body) as GFormPayload;
				const result = await handleGForm(payload);
				jsonResponse(res, 200, { ok: true, submissionId: result.submissionId });
			} catch (err) {
				console.error("[gform] Error:", err);
				jsonResponse(res, 500, { ok: false, error: String(err) });
			}
			return;
		}

		// Telegram webhook probe (GET)
		if (req.method === "GET" && url.pathname === "/api/telegram") {
			jsonResponse(res, 200, { ok: true });
			return;
		}

		// Telegram callback webhook (POST)
		if (req.method === "POST" && url.pathname === "/api/telegram") {
			try {
				const body = await parseBody(req);
				const update = JSON.parse(body) as TelegramUpdate;
				// Handle async — respond 200 immediately so Telegram doesn't retry
				handleCallbackQuery(update).catch((err) =>
					console.error("[telegram-cb] Error:", err),
				);
				jsonResponse(res, 200, { ok: true });
			} catch (err) {
				console.error("[telegram-cb] Parse error:", err);
				jsonResponse(res, 200, { ok: true });
			}
			return;
		}

		// Tally webhook
		if (req.method === "POST" && url.pathname === "/webhook") {
			try {
				const body = await parseBody(req);
				const payload = JSON.parse(body) as TallyPayload;
				const result = await handleTally(payload);
				jsonResponse(res, 200, { ok: true, submissionId: result.submissionId });
			} catch (err) {
				console.error("[tally] Error:", err);
				jsonResponse(res, 200, { ok: true, error: true });
			}
			return;
		}

		// 404
		jsonResponse(res, 404, { error: "Not found" });
	});

	server.listen(port, () => {
		console.log(`[server] ClawBerries webhook server listening on http://localhost:${port}`);
		console.log(`[server] POST /api/applications — Google Form submissions`);
		console.log(`[server] POST /webhook           — Tally form submissions`);
		console.log(`[server] POST /api/telegram      — Telegram bot callback queries`);
		console.log(`[server] GET  /health             — health check`);
		console.log(`\n[tip] Set Telegram webhook: curl -X POST "https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook" -d "url=<YOUR_NGROK_URL>/api/telegram"`);
	});
}
