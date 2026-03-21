import { callTinyFish } from "../tinyfish-client.js";
import type { WebSearchReport } from "@/shared/types/research.js";

const TIMEOUT_MS = 30_000;

/**
 * 5E — Web Search Agent
 *
 * Uses `lite` profile — Google search results are standard HTML,
 * no advanced bot protection needed for basic searches.
 */
export async function runWebSearchAgent(
	candidateName: string,
	recentCompany: string | null,
	_requestId: string,
): Promise<WebSearchReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	const companyQuery = recentCompany ? ` ${recentCompany}` : "";
	const searchQuery = `"${candidateName}"${companyQuery}`;

	try {
		const { result } = await callTinyFish(
			{
				url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
				goal: `Search for public information about "${candidateName}" and extract:

Run these searches (or navigate to these URLs):
1. Google: "${candidateName}"${recentCompany ? ` "${recentCompany}"` : ""} — general mentions
2. Google: "${candidateName}" site:linkedin.com OR site:github.com — profile verification
3. Google: "${candidateName}" conference OR speaker OR award OR publication — achievements

Return structured JSON with:
- candidateName: string
- mentions: array of { source, title, url, snippet, relevance: "high"|"medium"|"low" }
- conferenceCount: number of conference talks / speaker credits found
- awardCount: number of awards or recognitions found
- summary: brief narrative of key public findings`,
				browser_profile: "lite",
			},
			controller.signal,
		);

		const raw = result as Partial<WebSearchReport>;

		return {
			candidateName: raw.candidateName ?? candidateName,
			mentions: raw.mentions ?? [],
			conferenceCount: raw.conferenceCount ?? 0,
			awardCount: raw.awardCount ?? 0,
			summary: raw.summary ?? `Web search: ${raw.mentions?.length ?? 0} mentions found`,
		};
	} finally {
		clearTimeout(timer);
	}
}
