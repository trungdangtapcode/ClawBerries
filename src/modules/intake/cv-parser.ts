import type { CandidateProfile } from "@/shared/types/candidate.js";
import { parseCvFromBuffer } from "@/features/step3-step4/index.js";

/**
 * Step 3: CV Parsing & Entity Extraction
 *
 * Converts an uploaded CV file into a structured CandidateProfile.
 * Supports PDF and DOCX via multimodal LLM extraction.
 */
export async function parseCv(
	fileBuffer: Buffer,
	fileName: string,
): Promise<CandidateProfile> {
	return parseCvFromBuffer(fileBuffer, fileName);
}
