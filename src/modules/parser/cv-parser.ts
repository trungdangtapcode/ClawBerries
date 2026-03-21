import { promises as fs } from "node:fs";
import path from "node:path";

// ─── Layer 1: Identity & Contact ─────────────────────────────────────────────

export type Identity = {
	fullName: string;
	nameVariants: string[];
	email: string | null;
	phone: string | null;
	location: string | null;
};

// ─── Layer 2: Education ──────────────────────────────────────────────────────

export type EducationEntry = {
	school: string;
	degree: string | null;
	field: string | null;
	startDate: string | null;
	endDate: string | null;
	gpa: { value: number; scale: number } | null;
};

// ─── Layer 3: Work History ───────────────────────────────────────────────────

export type WorkEntry = {
	company: string;
	title: string;
	startDate: string | null;
	endDate: string | null;
	description: string | null;
};

// ─── Layer 4: Skills, Links, Publications, Awards, Document Meta ─────────────

export type SkillEntry = {
	name: string;
	evidencedBy: "github" | "portfolio" | "publication" | "claim_only";
};

export type LinkEntry = {
	href: string;
	type: "linkedin" | "github" | "portfolio" | "email" | "phone" | "publication" | "other";
	text: string | null;
	page: number | null;
};

export type PublicationEntry = {
	title: string;
	venue: string | null;
	date: string | null;
	coAuthors: string[];
	doi: string | null;
};

export type AwardEntry = {
	title: string;
	organization: string | null;
	date: string | null;
	rank: string | null;
};

export type DocumentMeta = {
	pageCount: number;
	language: string | null;
};

// ─── Combined extraction result ──────────────────────────────────────────────

export type PdfOcrResult = {
	identity: Identity;
	education: EducationEntry[];
	workHistory: WorkEntry[];
	skills: SkillEntry[];
	links: LinkEntry[];
	publications: PublicationEntry[];
	awards: AwardEntry[];
	documentMeta: DocumentMeta;
};

type GeminiGenerateContentResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
	promptFeedback?: {
		blockReason?: string;
	};
};

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function buildPrompt(userTask: string): string {
	return `
You are a resume/CV extraction assistant. Extract structured data from the attached PDF.

Task:
${userTask}

Return a JSON object with ALL of the following sections:

1. "identity" — candidate contact info
   - "fullName": string (primary name as written)
   - "nameVariants": string[] (all plausible orderings, e.g. "Nguyen Tien Thang", "Thang Nguyen", "Thắng Nguyễn Tiến")
   - "email": string | null
   - "phone": string | null (include country code if present)
   - "location": string | null

2. "education" — array of education entries
   - "school": string
   - "degree": string | null (e.g. "Bachelor", "Master", "PhD")
   - "field": string | null (e.g. "Artificial Intelligence", "Computer Science")
   - "startDate": string | null (YYYY-MM format)
   - "endDate": string | null (YYYY-MM format)
   - "gpa": { "value": number, "scale": number } | null (e.g. { "value": 8.45, "scale": 10 })

3. "workHistory" — array of work experience entries, ordered most recent first
   - "company": string
   - "title": string (exact title as written on CV)
   - "startDate": string | null (YYYY-MM format)
   - "endDate": string | null (YYYY-MM if ended, null if "Present")
   - "description": string | null (responsibilities/achievements combined)

4. "skills" — array of skills mentioned
   - "name": string (e.g. "Python", "Kubernetes")
   - "evidencedBy": one of "github" | "portfolio" | "publication" | "claim_only"
     Use "github" if the skill appears in a GitHub project description.
     Use "portfolio" if evidenced by a portfolio/project link.
     Use "publication" if mentioned in a publication.
     Otherwise use "claim_only".

5. "links" — every URL/href found in the PDF
   - "href": string (full URL)
   - "type": one of "linkedin" | "github" | "portfolio" | "email" | "phone" | "publication" | "other"
   - "text": string | null (anchor text or display text near the link)
   - "page": number | null (which page it appears on)

6. "publications" — array of academic publications
   - "title": string
   - "venue": string | null (conference/journal name)
   - "date": string | null (YYYY or YYYY-MM)
   - "coAuthors": string[] (list of co-author names)
   - "doi": string | null

7. "awards" — array of awards, prizes, honors, scholarships
   - "title": string
   - "organization": string | null (who granted it)
   - "date": string | null (YYYY or YYYY-MM)
   - "rank": string | null (e.g. "Winner", "Second Prize", "Third Prize", "Finalist")

8. "documentMeta"
   - "pageCount": number
   - "language": string | null (primary language, e.g. "en", "vi")

Rules:
- Do not invent content. Only extract what is present in the PDF.
- For Vietnamese names, always generate nameVariants with and without diacritics.
- Use YYYY-MM date format wherever possible. Use "Present" → null for endDate.
- For links: include mailto:, tel:, http://, https:// — every clickable href.
- For skills evidencedBy: check if the skill appears in a linked GitHub/portfolio project context.
- Return valid JSON only.
`.trim();
}

async function readPdfAsBase64(pdfPath: string): Promise<string> {
	const buffer = await fs.readFile(pdfPath);
	return buffer.toString("base64");
}

function parseGeminiJson(
	responseJson: GeminiGenerateContentResponse,
	fileName: string,
): PdfOcrResult {
	if (responseJson.promptFeedback?.blockReason) {
		throw new Error(`Gemini blocked request: ${responseJson.promptFeedback.blockReason}`);
	}
	const text = responseJson.candidates?.[0]?.content?.parts
		?.map((part) => part.text ?? "")
		.join("")
		.trim();
	if (!text) {
		throw new Error(`Gemini returned empty content for ${fileName}.`);
	}

	const normalizedText = text
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();

	try {
		const parsed = JSON.parse(normalizedText);
		return (Array.isArray(parsed) ? parsed[0] : parsed) as PdfOcrResult; // unwrap if Gemini returns [{...}]
	} catch (error) {
		throw new Error(
			`Failed to parse Gemini JSON output for ${fileName}: ${String(error)}\nRaw output:\n${text}`,
		);
	}
}

export async function processPdfWithGemini(
	pdfPath: string,
	userTask: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PdfOcrResult> {
	const apiKey = process.env.GEMINI_API_KEY;
	const baseURL = process.env.GEMINI_BASE_URL ?? DEFAULT_BASE_URL;
	const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
	const absolutePdfPath = path.resolve(pdfPath);
	const prompt = buildPrompt(userTask);

	if (path.extname(absolutePdfPath).toLowerCase() !== ".pdf") {
		throw new Error(`Expected a PDF file path, got: ${pdfPath}`);
	}
	if (!(await fileExists(absolutePdfPath))) {
		throw new Error(`PDF file not found: ${absolutePdfPath}`);
	}
	if (!apiKey) {
		throw new Error("Missing GEMINI_API_KEY.");
	}

	const pdfBase64 = await readPdfAsBase64(absolutePdfPath);

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, timeoutMs);

	try {
		const endpoint = `${baseURL}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{
								text: prompt,
							},
							{
								inline_data: {
									mime_type: "application/pdf",
									data: pdfBase64,
								},
							},
						],
					},
				],
				generationConfig: {
					responseMimeType: "application/json",
				},
			}),
			signal: abortController.signal,
		});
		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(
				`Gemini API request failed (${response.status} ${response.statusText}): ${errorBody}`,
			);
		}
		const responseJson = (await response.json()) as GeminiGenerateContentResponse;
		return parseGeminiJson(responseJson, path.basename(absolutePdfPath));
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "AbortError" || error.message.includes("aborted"))
		) {
			throw new Error(`Gemini OCR request timed out after ${timeoutMs}ms.`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

export async function processPdfWithCodex(
	pdfPath: string,
	userTask: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PdfOcrResult> {
	return processPdfWithGemini(pdfPath, userTask, timeoutMs);
}

export class GeminiPdfWorker {
	private readonly timeoutMs: number;

	constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
		this.timeoutMs = timeoutMs;
	}

	async process(pdfPath: string, task: string): Promise<PdfOcrResult> {
		return processPdfWithGemini(pdfPath, task, this.timeoutMs);
	}
}

export class CodexPdfWorker {
	private readonly timeoutMs: number;

	constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
		this.timeoutMs = timeoutMs;
	}

	async process(pdfPath: string, task: string): Promise<PdfOcrResult> {
		return processPdfWithGemini(pdfPath, task, this.timeoutMs);
	}
}
