import type { PdfOcrResult } from "@/features/step3-step4/codex-pdf-ocr.js";
import type { AgentPlan } from "@/shared/types/candidate.js";
import { planAndDispatchAgents } from "@/features/step3-step4/index.js";

/**
 * Step 4: Task Planning & Dispatch
 *
 * Examines the extracted profile, decides which research agents
 * to launch, and dispatches them in parallel.
 */
export async function dispatchAgents(
	requestId: string,
	ocrResult: PdfOcrResult,
): Promise<AgentPlan[]> {
	return planAndDispatchAgents(requestId, ocrResult);
}
