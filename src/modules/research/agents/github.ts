import type { GitHubReport } from "@/shared/types/research.js";
import { callTinyFish } from "../tinyfish-client.js";

const TIMEOUT_MS = 30_000;

/**
 * 5B — GitHub Agent
 *
 * Uses `lite` browser profile — GitHub API endpoints are plain JSON REST,
 * no JavaScript rendering or bot detection needed.
 * Starts at the user profile API URL and instructs TinyFish to also
 * fetch the repos and events endpoints.
 */
export async function runGitHubAgent(
	profileUrl: string,
	_requestId: string,
): Promise<GitHubReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	// Derive username from the GitHub profile URL
	const username = profileUrl.replace(/\/$/, "").split("/").pop() ?? "";

	try {
		const { result } = await callTinyFish(
			{
				url: `https://api.github.com/users/${username}`,
				goal: `Fetch this GitHub user's data from the GitHub REST API and return as JSON:
Also fetch:
  - https://api.github.com/users/${username}/repos?sort=updated&per_page=30
  - https://api.github.com/users/${username}/events?per_page=100

Return structured JSON with:
- username: string
- totalRepos: number
- totalStars: total stars across all repos
- commitsLast90Days: approximate commit count in last 90 days from events
- topLanguages: array of { language, percentage }
- notableRepos: array of { name, stars, forks, description } where stars > 10
- skillsEvidence: object mapping claimed skills to true/false based on actual languages used`,
				browser_profile: "lite",
			},
			controller.signal,
		);

		const raw = result as Partial<GitHubReport>;

		return {
			username: raw.username ?? username ?? "unknown",
			totalRepos: raw.totalRepos ?? 0,
			totalStars: raw.totalStars ?? 0,
			commitsLast90Days: raw.commitsLast90Days ?? 0,
			topLanguages: raw.topLanguages ?? [],
			notableRepos: raw.notableRepos ?? [],
			skillsEvidence: raw.skillsEvidence ?? {},
			summary:
				raw.summary ??
				`${raw.totalRepos ?? 0} repos, ${raw.totalStars ?? 0} stars`,
		};
	} finally {
		clearTimeout(timer);
	}
}
