import type { CandidateBrief } from "@/shared/types/candidate.js";

/**
 * Step 7: LLM Synthesis & Cross-Referencing
 *
 * Receives all research results and the original CV, then performs
 * cross-referencing, inconsistency detection, and generates analysis.
 */
export async function synthesize(
	_requestId: string,
): Promise<CandidateBrief> {
	// TODO: Assemble ResearchBundle from all agent results
	// TODO: Run cross-reference analysis via LLM
	// TODO: Detect inconsistencies with severity ratings
	// TODO: Identify strengths evidenced externally but not on CV
	// TODO: Generate 3 tailored interview questions
	// TODO: Assign overall GREEN/YELLOW/RED rating
	// TODO: Select model based on candidate seniority
	throw new Error("Not implemented");
}
