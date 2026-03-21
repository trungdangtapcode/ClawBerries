import type { CandidateBrief } from "@/shared/types/candidate.js";

/**
 * Step 8: Brief Assembly & Formatting
 *
 * Takes LLM synthesis output and formats it into a polished brief
 * optimized for Telegram delivery + a PDF version.
 */
export async function formatBrief(
	_brief: CandidateBrief,
	_researchDurationMs: number,
): Promise<{
	telegram: string;
	telegramChunks: string[];
	pdfUrl: string | null;
}> {
	// TODO: Apply Telegram-optimized template (scannable in 30s)
	// TODO: Generate styled PDF with screenshots
	// TODO: Store brief in S3, generate signed URL (24h expiry)
	// TODO: Handle Telegram 4096-char chunking
	throw new Error("Not implemented");
}
