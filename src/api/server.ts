/**
 * Lightweight HTTP API server for the ClawBerries web dashboard.
 *
 * Exposes read-only endpoints for the frontend to fetch
 * candidate data, pipeline stats, and recent applications.
 *
 * Run: tsx src/api/server.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, extname } from "node:path";
import { db, schema } from "@/shared/db/index.js";
import { config } from "@/shared/config/env.js";
import { count, desc, eq, gte, ilike, or, and, sql } from "drizzle-orm";
import { processPdfWithGemini } from "@/modules/parser/index.js";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Embed text using OpenAI text-embedding-3-small → 1536-dim float array */
async function embedText(text: string): Promise<number[]> {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-small",
		input: text.slice(0, 8000), // stay within token limits
	});
	return response.data[0]!.embedding;
}

const UPLOAD_DIR = join(process.cwd(), "uploads");

const PORT = config.PORT + 1; // 3001 — separate from CLI port

// ── CORS helper ───────────────────────────────────────────────────────────────
function cors(res: ServerResponse) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, data: unknown, status = 200) {
	cors(res);
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET /api/dashboard/stats — pipeline overview numbers */
async function getStats(_req: IncomingMessage, res: ServerResponse) {
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	const [
		totalResult,
		statusCounts,
		recentCount,
	] = await Promise.all([
		// Total candidates
		db.select({ total: count() }).from(schema.candidateProfiles),

		// Counts by request status
		db
			.select({
				status: schema.researchRequests.status,
				count: count(),
			})
			.from(schema.researchRequests)
			.groupBy(schema.researchRequests.status),

		// Candidates added in last 30 days
		db
			.select({ count: count() })
			.from(schema.candidateProfiles)
			.where(gte(schema.candidateProfiles.createdAt, thirtyDaysAgo)),
	]);

	const statusMap: Record<string, number> = {};
	for (const row of statusCounts) {
		statusMap[row.status] = row.count;
	}

	json(res, {
		totalApplicants: totalResult[0]?.total ?? 0,
		activeJobs: (statusMap["parsing"] ?? 0) + (statusMap["researching"] ?? 0) + (statusMap["synthesizing"] ?? 0),
		inReview: statusMap["received"] ?? 0,
		hiredThisMonth: statusMap["delivered"] ?? 0,
		recentCount: recentCount[0]?.count ?? 0,
		statusBreakdown: statusMap,
	});
}

/** GET /api/dashboard/recent-applications — latest candidate profiles */
async function getRecentApplications(_req: IncomingMessage, res: ServerResponse) {
	const rows = await db
		.select({
			id: schema.candidateProfiles.id,
			fullName: schema.candidateProfiles.fullName,
			email: schema.candidateProfiles.email,
			phone: schema.candidateProfiles.phone,
			skillsClaimed: schema.candidateProfiles.skillsClaimed,
			workHistory: schema.candidateProfiles.workHistory,
			createdAt: schema.candidateProfiles.createdAt,
			requestId: schema.candidateProfiles.requestId,
			requestStatus: schema.researchRequests.status,
			overallRating: schema.candidateBriefs.overallRating,
		})
		.from(schema.candidateProfiles)
		.leftJoin(
			schema.researchRequests,
			eq(schema.candidateProfiles.requestId, schema.researchRequests.id),
		)
		.leftJoin(
			schema.candidateBriefs,
			eq(schema.candidateProfiles.requestId, schema.candidateBriefs.requestId),
		)
		.orderBy(desc(schema.candidateProfiles.createdAt))
		.limit(20);

	const applications = rows.map((row) => {
		// Derive a "role" from the first work-history entry if available
		const work = Array.isArray(row.workHistory) ? row.workHistory : [];
		const latestJob =
			work.length > 0 && typeof work[0] === "object" && work[0] !== null
				? (work[0] as Record<string, unknown>)
				: null;

		return {
			id: row.id,
			name: row.fullName,
			role: latestJob?.title ?? latestJob?.position ?? "Applicant",
			email: row.email,
			phone: row.phone,
			createdAt: row.createdAt,
			status: mapStatus(row.requestStatus, row.overallRating),
			skills: Array.isArray(row.skillsClaimed) ? row.skillsClaimed : [],
		};
	});

	json(res, { applications, total: applications.length });
}

/** GET /api/dashboard/funnel — hiring funnel counts */
async function getFunnel(_req: IncomingMessage, res: ServerResponse) {
	const statusCounts = await db
		.select({
			status: schema.researchRequests.status,
			count: count(),
		})
		.from(schema.researchRequests)
		.groupBy(schema.researchRequests.status);

	const m: Record<string, number> = {};
	for (const row of statusCounts) {
		m[row.status] = row.count;
	}

	// Map pipeline stages to funnel
	const total = Object.values(m).reduce((a, b) => a + b, 0);
	const funnel = [
		{ label: "Applied", count: total },
		{ label: "Screened", count: (m["parsing"] ?? 0) + (m["researching"] ?? 0) + (m["synthesizing"] ?? 0) + (m["delivered"] ?? 0) },
		{ label: "Researched", count: (m["researching"] ?? 0) + (m["synthesizing"] ?? 0) + (m["delivered"] ?? 0) },
		{ label: "Synthesized", count: (m["synthesizing"] ?? 0) + (m["delivered"] ?? 0) },
		{ label: "Delivered", count: m["delivered"] ?? 0 },
	];

	json(res, { funnel });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapStatus(
	requestStatus: string | null,
	overallRating: string | null,
): "hired" | "pending" | "rejected" {
	if (requestStatus === "delivered") {
		if (overallRating === "green") return "hired";
		if (overallRating === "red") return "rejected";
	}
	return "pending";
}

/** GET /api/cv-library — uploaded CV files with candidate info */
async function getCvLibrary(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? "/", "http://localhost");
	const jobId = url.searchParams.get("jobId")?.trim() || null;

	let rows: any[];
	try {
		const baseQuery = db
			.select({
				id: schema.researchRequests.id,
				originalFileName: schema.researchRequests.originalFileName,
				fileStoragePath: schema.researchRequests.fileStoragePath,
				status: schema.researchRequests.status,
				requestedAt: schema.researchRequests.requestedAt,
				completedAt: schema.researchRequests.completedAt,
				candidateName: schema.candidateProfiles.fullName,
				candidateEmail: schema.candidateProfiles.email,
				overallRating: schema.candidateBriefs.overallRating,
				jobOpeningId: schema.researchRequests.jobOpeningId,
				screeningStatus: schema.researchRequests.screeningStatus,
			})
			.from(schema.researchRequests)
			.leftJoin(
				schema.candidateProfiles,
				eq(schema.researchRequests.id, schema.candidateProfiles.requestId),
			)
			.leftJoin(
				schema.candidateBriefs,
				eq(schema.researchRequests.id, schema.candidateBriefs.requestId),
			);

		rows = await (
			jobId
				? baseQuery.where(eq(schema.researchRequests.jobOpeningId, jobId))
				: baseQuery
		)
			.orderBy(desc(schema.researchRequests.requestedAt))
			.limit(50);
	} catch {
		// Fallback: job_opening_id column may not exist yet (migration not applied)
		rows = await db
			.select({
				id: schema.researchRequests.id,
				originalFileName: schema.researchRequests.originalFileName,
				fileStoragePath: schema.researchRequests.fileStoragePath,
				status: schema.researchRequests.status,
				requestedAt: schema.researchRequests.requestedAt,
				completedAt: schema.researchRequests.completedAt,
				candidateName: schema.candidateProfiles.fullName,
				candidateEmail: schema.candidateProfiles.email,
				overallRating: schema.candidateBriefs.overallRating,
			})
			.from(schema.researchRequests)
			.leftJoin(
				schema.candidateProfiles,
				eq(schema.researchRequests.id, schema.candidateProfiles.requestId),
			)
			.leftJoin(
				schema.candidateBriefs,
				eq(schema.researchRequests.id, schema.candidateBriefs.requestId),
			)
			.orderBy(desc(schema.researchRequests.requestedAt))
			.limit(50);
	}

	const files = rows.map((row) => {
		const fileName = row.originalFileName || "Unknown_CV.pdf";
		const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";

		return {
			id: row.id,
			name: fileName,
			type: ext,
			candidateName: row.candidateName || null,
			candidateEmail: row.candidateEmail || null,
			status: row.status,
			screeningStatus: row.screeningStatus || "pending",
			overallRating: row.overallRating || null,
			date: row.requestedAt,
			completedAt: row.completedAt,
			jobOpeningId: row.jobOpeningId || null,
			tags: buildTags(row.status, row.overallRating),
		};
	});

	json(res, { files, total: files.length });
}

/** GET /api/cv-profile/:id — full candidate profile for screening page */
async function getCvProfile(req: IncomingMessage, res: ServerResponse) {
	const id = req.url?.split("/").pop()?.split("?")[0];
	if (!id) { json(res, { error: "Missing id" }, 400); return; }

	try {
		const rows = await db
			.select({
				id: schema.researchRequests.id,
				originalFileName: schema.researchRequests.originalFileName,
				status: schema.researchRequests.status,
				screeningStatus: schema.researchRequests.screeningStatus,
				requestedAt: schema.researchRequests.requestedAt,
				completedAt: schema.researchRequests.completedAt,
				jobOpeningId: schema.researchRequests.jobOpeningId,
				// candidate_profiles
				fullName: schema.candidateProfiles.fullName,
				email: schema.candidateProfiles.email,
				phone: schema.candidateProfiles.phone,
				skillsClaimed: schema.candidateProfiles.skillsClaimed,
				// candidate_briefs
				overallRating: schema.candidateBriefs.overallRating,
				documentText: schema.candidateProfiles.documentText,
			})
			.from(schema.researchRequests)
			.leftJoin(schema.candidateProfiles, eq(schema.candidateProfiles.requestId, schema.researchRequests.id))
			.leftJoin(schema.candidateBriefs, eq(schema.candidateBriefs.requestId, schema.researchRequests.id))
			.where(eq(schema.researchRequests.id, id))
			.limit(1);

		if (rows.length === 0) { json(res, { error: "Not found" }, 404); return; }
		const row = rows[0]!;

		// Use skills from DB first, fall back to keyword extraction
		let skills: string[] = [];
		if (Array.isArray(row.skillsClaimed) && row.skillsClaimed.length > 0) {
			skills = row.skillsClaimed.map((s: any) => {
				if (typeof s === "string") return s;
				if (s && typeof s === "object" && s.name) return s.name;
				return String(s);
			});
		} else if (row.documentText) {
			const commonSkills = [
				"JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "C++", "C#",
				"AWS", "Azure", "GCP", "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "Redis",
				"GraphQL", "REST API", "Git", "Linux", "HTML", "CSS", "SQL",
				"Machine Learning", "Deep Learning", "NLP", "Computer Vision",
				"TensorFlow", "PyTorch", "Agile", "Scrum", "CI/CD",
				"Next.js", "Vue.js", "Angular", "Express", "Django", "Flask", "Spring Boot",
				"Figma", "Adobe", "Photoshop", "Illustrator",
			];
			for (const s of commonSkills) {
				if (row.documentText.toLowerCase().includes(s.toLowerCase())) {
					skills.push(s);
				}
			}
		}

		const candidate = {
			id: row.id,
			originalFileName: row.originalFileName || "Unknown_CV.pdf",
			candidateName: row.fullName || null,
			candidateEmail: row.email || null,
			phone: row.phone || null,
			currentTitle: null,
			status: row.status,
			screeningStatus: row.screeningStatus,
			overallRating: row.overallRating || null,
			date: row.requestedAt,
			completedAt: row.completedAt,
			jobOpeningId: row.jobOpeningId || null,
			fullName: row.fullName || null,
			skills,
			documentText: row.documentText || null,
		};

		json(res, { candidate });
	} catch (err) {
		console.error("[API] getCvProfile error:", err);
		json(res, { error: "Internal Server Error" }, 500);
	}
}

/** GET /api/cv-search?q=...&jobId=... — full-text keyword search across document_text */
async function searchCvs(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? "/", "http://localhost");
	const q = url.searchParams.get("q")?.trim() ?? "";
	const jobId = url.searchParams.get("jobId")?.trim() || null;

	if (!q || q.length < 2) {
		json(res, { files: [], total: 0, query: q });
		return;
	}

	const pattern = `%${q}%`;

	const rows = await db
		.select({
			id: schema.researchRequests.id,
			originalFileName: schema.researchRequests.originalFileName,
			fileStoragePath: schema.researchRequests.fileStoragePath,
			status: schema.researchRequests.status,
			requestedAt: schema.researchRequests.requestedAt,
			completedAt: schema.researchRequests.completedAt,
			candidateName: schema.candidateProfiles.fullName,
			candidateEmail: schema.candidateProfiles.email,
			overallRating: schema.candidateBriefs.overallRating,
		})
		.from(schema.researchRequests)
		.leftJoin(
			schema.candidateProfiles,
			eq(schema.researchRequests.id, schema.candidateProfiles.requestId),
		)
		.leftJoin(
			schema.candidateBriefs,
			eq(schema.researchRequests.id, schema.candidateBriefs.requestId),
		)
		.where(
			and(
				or(
					ilike(schema.candidateProfiles.documentText, pattern),
					ilike(schema.candidateProfiles.fullName, pattern),
					ilike(schema.candidateProfiles.email, pattern),
					ilike(schema.researchRequests.originalFileName, pattern),
				),
				jobId ? eq(schema.researchRequests.jobOpeningId, jobId) : undefined,
			),
		)
		.orderBy(desc(schema.researchRequests.requestedAt))
		.limit(50);

	const files = rows.map((row) => {
		const fileName = row.originalFileName || "Unknown_CV.pdf";
		const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
		return {
			id: row.id,
			name: fileName,
			type: ext,
			candidateName: row.candidateName || null,
			candidateEmail: row.candidateEmail || null,
			status: row.status,
			overallRating: row.overallRating || null,
			date: row.requestedAt,
			completedAt: row.completedAt,
			tags: buildTags(row.status, row.overallRating),
		};
	});

	json(res, { files, total: files.length, query: q });
}

function buildTags(status: string, rating: string | null): string[] {
	const tags: string[] = [];
	if (status === "delivered") tags.push("Completed");
	else if (status === "failed") tags.push("Failed");
	else if (status === "received") tags.push("New");
	else tags.push("Processing");

	if (rating === "green") tags.push("Strong");
	else if (rating === "yellow") tags.push("Review");
	else if (rating === "red") tags.push("Flagged");

	return tags;
}

// ── Job Openings CRUD ─────────────────────────────────────────────────────────

/** GET /api/jobs — list all job openings with applicant count */
async function getJobs(_req: IncomingMessage, res: ServerResponse) {
	const rows = await db
		.select({
			id: schema.jobOpenings.id,
			title: schema.jobOpenings.title,
			department: schema.jobOpenings.department,
			description: schema.jobOpenings.description,
			status: schema.jobOpenings.status,
			createdAt: schema.jobOpenings.createdAt,
			applicants: sql<number>`cast(count(${schema.researchRequests.id}) as int)`,
			shortlisted: sql<number>`cast(count(case when ${schema.candidateBriefs.overallRating} = 'green' then 1 end) as int)`,
		})
		.from(schema.jobOpenings)
		.leftJoin(schema.researchRequests, eq(schema.researchRequests.jobOpeningId, schema.jobOpenings.id))
		.leftJoin(schema.candidateBriefs, eq(schema.candidateBriefs.requestId, schema.researchRequests.id))
		.groupBy(schema.jobOpenings.id)
		.orderBy(desc(schema.jobOpenings.createdAt));

	json(res, { jobs: rows, total: rows.length });
}

/** POST /api/jobs — create a new job opening */
async function createJob(req: IncomingMessage, res: ServerResponse) {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	const body = JSON.parse(Buffer.concat(chunks).toString());

	if (!body.title) {
		json(res, { error: "title is required" }, 400);
		return;
	}

	const [row] = await db
		.insert(schema.jobOpenings)
		.values({
			title: body.title,
			department: body.department || null,
			description: body.description || null,
			status: body.status || "active",
		})
		.returning();

	console.log(`[API] Created job opening: ${row!.title} (${row!.id})`);
	json(res, { job: row }, 201);
}

/** PATCH /api/jobs/:id — update a job opening */
async function updateJob(req: IncomingMessage, res: ServerResponse) {
	const id = req.url?.split("/").pop()?.split("?")[0];
	if (!id) { json(res, { error: "Missing job id" }, 400); return; }

	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	const body = JSON.parse(Buffer.concat(chunks).toString());

	const updates: Record<string, unknown> = {};
	if (body.title !== undefined) updates.title = body.title;
	if (body.department !== undefined) updates.department = body.department;
	if (body.description !== undefined) updates.description = body.description;
	if (body.status !== undefined) updates.status = body.status;

	if (Object.keys(updates).length === 0) {
		json(res, { error: "Nothing to update" }, 400);
		return;
	}

	const [row] = await db
		.update(schema.jobOpenings)
		.set(updates)
		.where(eq(schema.jobOpenings.id, id))
		.returning();

	if (!row) { json(res, { error: "Job not found" }, 404); return; }
	json(res, { job: row });
}

/** PATCH /api/cv/:id/screening — update screening status */
async function updateScreeningStatus(req: IncomingMessage, res: ServerResponse) {
	const parts = req.url?.split("/") ?? [];
	// URL: /api/cv/<id>/screening
	const id = parts[3];
	if (!id) { json(res, { error: "Missing CV id" }, 400); return; }

	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	const body = JSON.parse(Buffer.concat(chunks).toString());
	const status = body.screeningStatus;

	const validStatuses = ["pending", "shortlisted", "waitlisted", "rejected"];
	if (!validStatuses.includes(status)) {
		json(res, { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
		return;
	}

	const [row] = await db
		.update(schema.researchRequests)
		.set({ screeningStatus: status })
		.where(eq(schema.researchRequests.id, id))
		.returning({ id: schema.researchRequests.id, screeningStatus: schema.researchRequests.screeningStatus });

	if (!row) { json(res, { error: "CV not found" }, 404); return; }
	json(res, { cv: row });
}

/** POST /api/cv-upload — upload a CV file */
async function uploadCv(req: IncomingMessage, res: ServerResponse) {
	// Collect the raw body
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	const body = Buffer.concat(chunks);

	const contentType = req.headers["content-type"] || "";

	if (!contentType.includes("multipart/form-data")) {
		json(res, { error: "Content-Type must be multipart/form-data" }, 400);
		return;
	}

	// Extract boundary from content-type
	const boundaryMatch = contentType.match(/boundary=(.+)/);
	if (!boundaryMatch) {
		json(res, { error: "Missing boundary in multipart request" }, 400);
		return;
	}

	const boundary = boundaryMatch[1]!;
	const parts = parseMultipart(body, boundary);

	if (parts.length === 0) {
		json(res, { error: "No files received" }, 400);
		return;
	}

	await mkdir(UPLOAD_DIR, { recursive: true });

	// Extract jobOpeningId from URL query params
	const uploadUrl = new URL(req.url ?? "/", "http://localhost");
	const jobOpeningId = uploadUrl.searchParams.get("jobId")?.trim() || null;

	const uploaded: { id: string; name: string }[] = [];

	for (const part of parts) {
		// Skip non-file parts (text form fields)
		if (!part.filename) continue;

		const fileId = randomUUID();
		const safeFileName = part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
		const storagePath = join(UPLOAD_DIR, `${fileId}_${safeFileName}`);

		await writeFile(storagePath, part.data);

		const [row] = await db
			.insert(schema.researchRequests)
			.values({
				jobOpeningId: jobOpeningId,
				telegramChatId: "web-upload",
				status: "received",
				originalFileName: part.filename,
				fileStoragePath: storagePath,
			})
			.returning({ id: schema.researchRequests.id });

		uploaded.push({ id: row!.id, name: part.filename });
		console.log(`[API] Uploaded: ${part.filename} → ${storagePath}`);

		// Fire-and-forget: parse the CV in the background (Step 3)
		if (part.filename.toLowerCase().endsWith(".pdf")) {
			const requestId = row!.id;
			parseCvInBackground(requestId, storagePath).catch((err) =>
				console.error(`[API] Background parse failed for ${requestId}:`, err)
			);
		}
	}

	json(res, { uploaded, count: uploaded.length }, 201);
}

/** Background Step 3: parse CV with Gemini and save to candidate_profiles */
async function parseCvInBackground(requestId: string, filePath: string) {
	try {
		// Mark as parsing
		await db
			.update(schema.researchRequests)
			.set({ status: "parsing" })
			.where(eq(schema.researchRequests.id, requestId));

		console.log(`[API] Step 3 parsing started for ${requestId}`);
		const ocrResult: PdfOcrResult = await processPdfWithGemini(
			filePath,
			"Extract all structured data from this CV.",
		);

		// Extract links by type
		const linkedinLink = ocrResult.links?.find((l) => l.type === "linkedin")?.href ?? null;
		const githubLink = ocrResult.links?.find((l) => l.type === "github")?.href ?? null;
		const portfolioLink = ocrResult.links?.find((l) => l.type === "portfolio")?.href ?? null;

		// Embed the document text for semantic search
		const embedding = ocrResult.document_text
			? await embedText(ocrResult.document_text)
			: null;

		// Insert candidate profile
		await db.insert(schema.candidateProfiles).values({
			requestId,
			fullName: ocrResult.identity.fullName,
			email: ocrResult.identity.email,
			phone: ocrResult.identity.phone,
			linksLinkedin: linkedinLink,
			linksGithub: githubLink,
			linksPortfolio: portfolioLink,
			workHistory: ocrResult.workHistory ?? [],
			education: ocrResult.education ?? [],
			skillsClaimed: ocrResult.skills ?? [],
			rawExtraction: ocrResult as unknown as Record<string, unknown>,
			documentText: ocrResult.document_text ?? null,
			documentVec: embedding,
		});

		// Mark as received (parsed, ready for research)
		await db
			.update(schema.researchRequests)
			.set({ status: "received" })
			.where(eq(schema.researchRequests.id, requestId));

		console.log(`[API] Step 3 complete for ${requestId}: ${ocrResult.identity.fullName}`);
	} catch (err) {
		console.error(`[API] Step 3 failed for ${requestId}:`, err);
		await db
			.update(schema.researchRequests)
			.set({ status: "failed" })
			.where(eq(schema.researchRequests.id, requestId))
			.catch(() => { });
	}
}

/** POST /api/cv-research/:id — trigger Steps 4-7 for a parsed CV */
async function triggerResearch(req: IncomingMessage, res: ServerResponse) {
	const id = req.url?.split("/").pop()?.split("?")[0];
	if (!id) { json(res, { error: "Missing request id" }, 400); return; }

	// Verify the request exists and has been parsed
	const rows = await db
		.select({ status: schema.researchRequests.status, rawExtraction: schema.candidateProfiles.rawExtraction })
		.from(schema.researchRequests)
		.leftJoin(schema.candidateProfiles, eq(schema.candidateProfiles.requestId, schema.researchRequests.id))
		.where(eq(schema.researchRequests.id, id))
		.limit(1);

	const row = rows[0];
	if (!row) { json(res, { error: "Request not found" }, 404); return; }
	if (!row.rawExtraction) { json(res, { error: "CV not yet parsed. Please wait for Step 3 to complete." }, 409); return; }

	// Return immediately, run pipeline in background
	json(res, { status: "started", requestId: id }, 202);

	// Steps 4-7 run in background
	runFullPipeline(id, row.rawExtraction as unknown as PdfOcrResult).catch((err) =>
		console.error(`[API] Pipeline failed for ${id}:`, err)
	);
}

/** Background Steps 4-7: research → synthesis */
async function runFullPipeline(requestId: string, ocrResult: PdfOcrResult) {
	try {
		const { planAndDispatchAgents, previewAgentTargets } = await import("@/modules/parser/index.js");
		const { runResearch } = await import("@/modules/research/run-research.js");
		const { reportProgress } = await import("@/modules/research/progress.js");
		const { synthesize } = await import("@/modules/synthesis/synthesizer.js");

		// Step 4: Plan & dispatch
		await db.update(schema.researchRequests).set({ status: "researching" }).where(eq(schema.researchRequests.id, requestId));
		await planAndDispatchAgents(requestId, ocrResult);
		const items = previewAgentTargets(ocrResult);
		console.log(`[API] Step 4: dispatched ${items.length} agents for ${requestId}`);

		// Steps 5+6: Research + progress
		await Promise.all([
			runResearch(requestId, items),
			reportProgress(requestId, ""),
		]);
		console.log(`[API] Steps 5+6 complete for ${requestId}`);

		// Step 7: Synthesize
		await db.update(schema.researchRequests).set({ status: "synthesizing" }).where(eq(schema.researchRequests.id, requestId));
		await synthesize(requestId, ocrResult);

		// Mark as delivered
		await db.update(schema.researchRequests).set({ status: "delivered", completedAt: new Date() }).where(eq(schema.researchRequests.id, requestId));
		console.log(`[API] Pipeline complete for ${requestId}`);
	} catch (err) {
		console.error(`[API] Pipeline error for ${requestId}:`, err);
		await db.update(schema.researchRequests).set({ status: "failed" }).where(eq(schema.researchRequests.id, requestId)).catch(() => { });
	}
}

/** Minimal multipart/form-data parser */
function parseMultipart(body: Buffer, boundary: string) {
	const sep = Buffer.from(`--${boundary}`);
	const parts: { filename: string; data: Buffer }[] = [];

	let start = 0;
	while (true) {
		const idx = body.indexOf(sep, start);
		if (idx === -1) break;

		if (start > 0) {
			// Extract the part between previous boundary and this one
			const partBuf = body.subarray(start, idx - 2); // -2 for trailing \r\n
			const headerEnd = partBuf.indexOf("\r\n\r\n");
			if (headerEnd !== -1) {
				const headers = partBuf.subarray(0, headerEnd).toString();
				const filenameMatch = headers.match(/filename="([^"]+)"/);
				if (filenameMatch) {
					parts.push({
						filename: filenameMatch[1]!,
						data: partBuf.subarray(headerEnd + 4),
					});
				}
			}
		}

		start = idx + sep.length + 2; // +2 for \r\n after boundary
	}

	return parts;
}

/** GET /api/cv-file/:id — serve raw file for preview */
async function serveCvFile(req: IncomingMessage, res: ServerResponse) {
	const id = req.url?.split("/").pop()?.split("?")[0];
	if (!id) { json(res, { error: "Missing id" }, 400); return; }

	const rows = await db
		.select({ path: schema.researchRequests.fileStoragePath, name: schema.researchRequests.originalFileName })
		.from(schema.researchRequests)
		.where(eq(schema.researchRequests.id, id))
		.limit(1);

	const row = rows[0];
	if (!row?.path || !existsSync(row.path)) {
		json(res, { error: "File not found" }, 404);
		return;
	}

	const ext = extname(row.path).toLowerCase();
	const mimeTypes: Record<string, string> = {
		".pdf": "application/pdf",
		".doc": "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".txt": "text/plain; charset=utf-8",
		".rtf": "application/rtf",
	};
	const mime = mimeTypes[ext] ?? "application/octet-stream";
	const fileBuffer = await readFile(row.path);

	cors(res);
	res.writeHead(200, {
		"Content-Type": mime,
		"Content-Length": fileBuffer.length,
		"Content-Disposition": `inline; filename="${row.name ?? "file"}"`
	});
	res.end(fileBuffer);
}

// ── Router ────────────────────────────────────────────────────────────────────
const exactRoutes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
	"GET /api/dashboard/stats": getStats,
	"GET /api/dashboard/recent-applications": getRecentApplications,
	"GET /api/dashboard/funnel": getFunnel,
	"GET /api/cv-library": getCvLibrary,
	"GET /api/cv-search": searchCvs,
	"GET /api/jobs": getJobs,
	"POST /api/jobs": createJob,
	"POST /api/cv-upload": uploadCv,
};

const server = createServer(async (req, res) => {
	// Handle CORS preflight
	if (req.method === "OPTIONS") {
		cors(res);
		res.writeHead(204);
		res.end();
		return;
	}

	const path = req.url?.split("?")[0] ?? "";
	const key = `${req.method} ${path}`;
	const handler = exactRoutes[key]
		?? (req.method === "GET" && path.startsWith("/api/cv-file/") ? serveCvFile : undefined)
		?? (req.method === "POST" && path.startsWith("/api/cv-research/") ? triggerResearch : undefined)
		?? (req.method === "PATCH" && path.startsWith("/api/jobs/") ? updateJob : undefined)
		?? (req.method === "PATCH" && path.match(/^\/api\/cv\/[^/]+\/screening$/) ? updateScreeningStatus : undefined)
		?? (req.method === "GET" && path.match(/^\/api\/cv-profile\/[^/]+$/) ? getCvProfile : undefined);

	if (handler) {
		try {
			await handler(req, res);
		} catch (err) {
			console.error(`[API] Error in ${key}:`, err);
			json(res, { error: "Internal Server Error" }, 500);
		}
	} else {
		json(res, { error: "Not Found" }, 404);
	}
});

server.listen(PORT, () => {
	console.log(`[API] Dashboard API running at http://localhost:${PORT}`);
});
