import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

const execFileAsync = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.WEBHOOK_PORT) || 3006;
const DATABASE_URL = process.env.DATABASE_URL!;
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "../storage");
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789";
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const PIPELINE_DIR = path.resolve(process.env.PIPELINE_DIR || "..");

// ─── DB ──────────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

const formSubmissions = pgTable("form_submissions", {
	id: uuid().primaryKey().defaultRandom(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	email: varchar("email", { length: 255 }).notNull(),
	originalFileName: varchar("original_file_name", { length: 255 }),
	storagePath: text("storage_path").notNull(),
	tallyResponseId: varchar("tally_response_id", { length: 64 }),
	requestId: uuid("request_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Tally payload types ─────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findField(fields: TallyField[], label: string): TallyField | undefined {
	return fields.find((f) => f.label.toLowerCase().includes(label.toLowerCase()));
}

async function downloadPdf(url: string, destPath: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
	if (!res.body) throw new Error("Empty response body");
	await mkdir(path.dirname(destPath), { recursive: true });
	const writeStream = createWriteStream(destPath);
	await pipeline(Readable.fromWeb(res.body as any), writeStream);
}

/**
 * Convert the first page of a PDF to a PNG image using pdftoppm.
 * Returns the path to the generated PNG.
 */
async function pdfFirstPageToImage(pdfPath: string): Promise<string> {
	const outputPrefix = pdfPath.replace(/\.pdf$/i, "-preview");
	// pdftoppm -png -f 1 -l 1 -r 200 input.pdf outputPrefix
	// produces outputPrefix-1.png
	await execFileAsync("pdftoppm", [
		"-png", "-f", "1", "-l", "1", "-r", "200",
		pdfPath, outputPrefix,
	]);
	return `${outputPrefix}-1.png`;
}

/**
 * Send a photo with caption to a Telegram chat via Bot API (no polling needed).
 */
async function sendTelegramPhoto(
	chatId: string,
	imagePath: string,
	caption: string,
): Promise<void> {
	if (!TELEGRAM_BOT_TOKEN || !chatId) {
		console.log("[telegram] Skipped — missing token or chat_id");
		return;
	}

	const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

	const formData = new FormData();
	formData.append("chat_id", chatId);
	formData.append("caption", caption);
	formData.append("parse_mode", "HTML");

	// Read file as blob for FormData
	const fileBuffer = await import("node:fs/promises").then((fs) => fs.readFile(imagePath));
	const blob = new Blob([fileBuffer], { type: "image/png" });
	formData.append("photo", blob, path.basename(imagePath));

	const res = await fetch(url, { method: "POST", body: formData });

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error(`[telegram] sendPhoto failed (${res.status}): ${body}`);
	} else {
		console.log("[telegram] Photo sent to chat", chatId);
	}
}

/**
 * Send a text message to a Telegram chat via Bot API.
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
	if (!TELEGRAM_BOT_TOKEN || !chatId) return;

	const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error(`[telegram] sendMessage failed (${res.status}): ${body}`);
	}
}

// ─── CV Pipeline runner ──────────────────────────────────────────────────────

function runPipeline(pdfPath: string): Promise<{ ok: boolean; output: string }> {
	return new Promise((resolve) => {
		const proc = spawn("pnpm", ["dev", pdfPath], {
			cwd: PIPELINE_DIR,
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
	const jsonMatch = output.match(/\n(\{[\s\S]*\})\s*$/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function formatBriefForTelegram(brief: Record<string, unknown>): string {
	const rating = brief.overallRating as string;
	const ratingEmoji = rating === "green" ? "🟢" : rating === "red" ? "🔴" : "🟡";
	const name = brief.candidateName as string;
	const summary = brief.summary as string;

	const lines: string[] = [];
	lines.push(`${ratingEmoji} <b>${name}</b> — ${rating.toUpperCase()}`);
	lines.push("");
	lines.push(summary);

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
			lines.push(`  • [${(inc.severity as string).toUpperCase()}] ${inc.cvClaim}`);
		}
		if (inconsistencies.length > 5) lines.push(`  ... và ${inconsistencies.length - 5} khác`);
	}

	const questions = brief.interviewQuestions as string[] | undefined;
	if (questions && questions.length > 0) {
		lines.push("");
		lines.push("❓ <b>Câu hỏi phỏng vấn:</b>");
		for (const q of questions.slice(0, 3)) {
			lines.push(`  • ${q}`);
		}
	}

	return lines.join("\n");
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Express (Tally webhook) ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
	const payload = req.body as TallyPayload;

	console.log("\n══════ Tally Webhook Received ══════");
	console.log("Event:", payload.eventType, "| Response:", payload.data?.responseId);

	try {
		const fields = payload.data.fields;
		const fullName = (findField(fields, "họ và tên")?.value as string) ?? "";
		const email = (findField(fields, "email")?.value as string) ?? "";
		const fileField = findField(fields, "cv");
		const files = (fileField?.value ?? []) as TallyFileValue[];

		console.log(`👤 ${fullName} | 📧 ${email} | 📎 ${files.length} file(s)`);

		if (!fullName || !email) {
			console.warn("[warn] Missing name or email, skipping.");
			res.status(200).json({ ok: true, skipped: true });
			return;
		}

		for (const file of files) {
			if (file.mimeType !== "application/pdf") continue;

			const fileId = randomUUID();
			const filePath = path.join(STORAGE_DIR, `${fileId}.pdf`);

			console.log(`[download] ${file.name} → ${filePath}`);
			await downloadPdf(file.url, filePath);
			console.log(`[download] Done (${file.size} bytes)`);

			// Insert into DB
			const [row] = await db
				.insert(formSubmissions)
				.values({
					fullName,
					email,
					originalFileName: file.name,
					storagePath: filePath,
					tallyResponseId: payload.data.responseId,
				})
				.returning({ id: formSubmissions.id });

			console.log(`[db] Saved form_submissions.id = ${row!.id}`);

			// Convert first page to image + send to Telegram
			if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
				try {
					const imagePath = await pdfFirstPageToImage(filePath);
					const caption = `📥 <b>Form mới từ Tally</b>\n\n👤 Name: ${escapeHtml(fullName)}\n📧 Email: ${escapeHtml(email)}\n📎 File: ${escapeHtml(file.name)}`;
					await sendTelegramPhoto(TELEGRAM_CHAT_ID, imagePath, caption);
					// Cleanup preview image
					await unlink(imagePath).catch(() => {});
				} catch (err) {
					console.error("[preview] Failed:", err instanceof Error ? err.message : err);
				}
			}
		}

		console.log("════════════════════════════════════\n");
		res.status(200).json({ ok: true });
	} catch (err) {
		console.error("[error]", err instanceof Error ? err.message : err);
		res.status(200).json({ ok: true, error: true });
	}
});

// ─── /checkcv endpoint (called via Telegram bot or API) ──────────────────────

app.post("/checkcv", async (req, res) => {
	const { email, chat_id } = req.body as { email?: string; chat_id?: string };
	const chatId = chat_id || TELEGRAM_CHAT_ID;

	if (!email) {
		res.status(400).json({ error: "email required" });
		return;
	}

	const rows = await db
		.select()
		.from(formSubmissions)
		.where(eq(formSubmissions.email, email))
		.orderBy(formSubmissions.createdAt)
		.limit(1);

	if (rows.length === 0) {
		await sendTelegramMessage(chatId, `❌ Không tìm thấy CV nào với email: ${escapeHtml(email)}`);
		res.status(404).json({ error: "not found" });
		return;
	}

	const submission = rows[0]!;
	await sendTelegramMessage(chatId,
		`📄 Tìm thấy CV: ${escapeHtml(submission.fullName)} (${escapeHtml(submission.originalFileName ?? "")})\n⏳ Đang phân tích...`,
	);

	console.log(`[checkcv] Running pipeline for ${email} → ${submission.storagePath}`);
	const { ok, output } = await runPipeline(submission.storagePath);

	if (!ok) {
		await sendTelegramMessage(chatId, `❌ Pipeline lỗi:\n<pre>${escapeHtml(output.slice(-500))}</pre>`);
		res.status(500).json({ error: "pipeline failed" });
		return;
	}

	const brief = extractBriefFromOutput(output);
	if (!brief) {
		await sendTelegramMessage(chatId, "❌ Không thể parse kết quả phân tích.");
		res.status(500).json({ error: "parse failed" });
		return;
	}

	const message = formatBriefForTelegram(brief);
	await sendTelegramMessage(chatId, message);
	console.log(`[checkcv] Done for ${email}`);

	res.status(200).json({ ok: true, brief });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
	console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
	console.log(`Storage: ${STORAGE_DIR}`);
	console.log(`Pipeline: ${PIPELINE_DIR}`);
	console.log(`POST /webhook  → Tally form → save PDF + send preview to Telegram`);
	console.log(`POST /checkcv  → { email } → run pipeline → send result to Telegram`);
});
