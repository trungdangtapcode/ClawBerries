import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "@/shared/config/env.js";
import { db, schema } from "@/shared/db/index.js";
import { sendMessage, getHrChatId } from "./telegram.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApplicationPayload {
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

// ─── CV Download ─────────────────────────────────────────────────────────────

const CV_DIR = join(process.cwd(), "cv-uploads");

async function downloadCv(downloadUrl: string, fileName: string): Promise<string> {
	await mkdir(CV_DIR, { recursive: true });
	const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
	const filePath = join(CV_DIR, safeName);

	const res = await fetch(downloadUrl, { redirect: "follow" });
	if (!res.ok) {
		throw new Error(`Failed to download CV: ${res.status} ${res.statusText}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	await writeFile(filePath, buffer);
	return filePath;
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleApplication(payload: ApplicationPayload): Promise<{ requestId: string }> {
	const { applicant, cv } = payload;

	// Download CV if available
	let cvPath: string | null = null;
	if (cv.downloadUrl && cv.fileName) {
		try {
			cvPath = await downloadCv(cv.downloadUrl, cv.fileName);
		} catch (err) {
			console.error("[webhook] CV download failed:", err);
		}
	}

	// Store in DB
	const [row] = await db
		.insert(schema.researchRequests)
		.values({
			telegramChatId: getHrChatId(),
			status: "received",
			originalFileName: cv.fileName,
			fileStoragePath: cvPath,
		})
		.returning({ id: schema.researchRequests.id });

	const requestId = row!.id;

	// Notify HR on Telegram
	const lines = [
		`<b>New Application Received</b>`,
		``,
		`<b>Name:</b> ${escapeHtml(applicant.fullName)}`,
		`<b>Email:</b> ${escapeHtml(applicant.email)}`,
		`<b>Position:</b> ${escapeHtml(applicant.position)}`,
		`<b>CV:</b> ${cv.fileName ?? "No file attached"}`,
		``,
		`<i>Request ID: ${requestId}</i>`,
	];

	await sendMessage(getHrChatId(), lines.join("\n"), [
		[
			{ text: "Verify Now", callback_data: `cb_run:${requestId}` },
			{ text: "Skip", callback_data: `cb_skip:${requestId}` },
		],
		[
			{ text: "View CV", callback_data: `cb_viewcv:${requestId}` },
		],
	]);

	return { requestId };
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

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export function startServer(port: number = config.PORT): void {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

		// Health check
		if (req.method === "GET" && url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
			return;
		}

		// Webhook: new application from Google Form
		if (req.method === "POST" && url.pathname === "/api/applications") {
			try {
				const body = await parseBody(req);
				const payload = JSON.parse(body) as ApplicationPayload;

				const result = await handleApplication(payload);

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, requestId: result.requestId }));
			} catch (err) {
				console.error("[webhook] Error:", err);
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: String(err) }));
			}
			return;
		}

		// 404
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found" }));
	});

	server.listen(port, () => {
		console.log(`[server] ClawBerries webhook server listening on http://localhost:${port}`);
		console.log(`[server] POST /api/applications — receive Google Form submissions`);
		console.log(`[server] GET  /health — health check`);
	});
}
