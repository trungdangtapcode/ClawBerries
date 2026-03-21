/**
 * Step 5B: GitHub Agent
 *
 * Fetches and analyzes a candidate's GitHub profile.
 * Cross-references claimed skills against actual languages used.
 */
export async function runGitHubAgent(
	_githubUrl: string,
	_requestId: string,
): Promise<Record<string, unknown>> {
	// TODO: Call GitHub REST API for user profile and repos
	// TODO: Fetch contribution stats (last 90 days)
	// TODO: Calculate top languages, commit frequency, star count
	// TODO: Cross-reference claimed skills vs actual languages
	// TODO: Identify notable repos (stars > 10, forks > 5)
	// TODO: Return GitHubReport JSON
	throw new Error("Not implemented");
}
