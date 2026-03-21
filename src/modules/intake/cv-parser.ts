import type { CandidateProfile } from "@/shared/types/candidate.js";

/**
 * Step 3: CV Parsing & Entity Extraction
 *
 * Converts an uploaded CV file into a structured CandidateProfile.
 * Supports PDF and DOCX via multimodal LLM extraction.
 */
export async function parseCv(
	_fileBuffer: Buffer,
	_fileName: string,
): Promise<CandidateProfile> {
	// TODO: Implement document conversion (PDF -> image, DOCX -> text)
	// TODO: Run multimodal LLM extraction (Claude Sonnet with vision)
	// TODO: Extract entities into CandidateProfile
	// TODO: Validate extracted data (dates, email, phone, URLs)
	throw new Error("Not implemented");
}
