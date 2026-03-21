import type { AgentPlan, CandidateProfile } from "@/shared/types/candidate.js";

/**
 * Step 4: Task Planning & Dispatch
 *
 * Examines the extracted profile, decides which research agents
 * to launch, and dispatches them in parallel.
 */
export async function dispatchAgents(
	_requestId: string,
	_profile: CandidateProfile,
): Promise<AgentPlan[]> {
	// TODO: Evaluate available data points and build agent plan
	// TODO: Check rate limits in Redis
	// TODO: Dispatch agents in parallel via TinyFish
	// TODO: Create agent tracking records in DB
	// TODO: Set progress tracker in Redis
	throw new Error("Not implemented");
}
