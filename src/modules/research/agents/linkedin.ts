/**
 * Step 5A: LinkedIn Agent
 *
 * Fetches and analyzes a candidate's LinkedIn profile.
 * Compares positions against CV work history and flags discrepancies.
 */
export async function runLinkedInAgent(
	_linkedinUrl: string,
	_requestId: string,
): Promise<Record<string, unknown>> {
	// TODO: Call Bright Data / ScrapIn API with LinkedIn URL
	// TODO: Extract positions, education, endorsements, recommendations
	// TODO: Compare positions against CV work_history[]
	// TODO: Flag discrepancies (title mismatches, date gaps, missing roles)
	// TODO: Return LinkedInReport JSON
	throw new Error("Not implemented");
}
