/**
 * Step 5E: Web Search Agent
 *
 * Searches the public web for mentions of the candidate.
 * Catches conference talks, publications, awards, and other signals.
 */
export async function runWebSearchAgent(
	_candidateName: string,
	_recentCompany: string | null,
	_requestId: string,
): Promise<Record<string, unknown>> {
	// TODO: Search "{name}" on LinkedIn and GitHub via SerpAPI
	// TODO: Search "{name}" + most recent company
	// TODO: Search "{name}" + conference/speaker/award
	// TODO: Compile findings (articles, mentions, talks, awards)
	// TODO: Return WebSearchReport JSON
	throw new Error("Not implemented");
}
