import type { LinkedInReport } from "@/shared/types/research.js";
import { callTinyFish } from "../tinyfish-client.js";

const TIMEOUT_MS = 45_000;

/**
 * 5A — LinkedIn Agent
 *
 * Uses `stealth` browser profile to bypass LinkedIn's bot detection.
 * Navigates directly to the profile URL and extracts structured data.
 */
export async function runLinkedInAgent(
	profileUrl: string,
	_requestId: string,
): Promise<LinkedInReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const { result } = await callTinyFish(
			{
				url: profileUrl,
				goal: `Extract the following structured data from this LinkedIn profile and return as JSON:
- positions: array of { title, company, startDate, endDate, description }
- education: array of { school, degree, fieldOfStudy, graduationYear }
- endorsementsCount: number of skill endorsements
- recommendationsCount: number of written recommendations
- profileFound: true/false
- discrepancies: any obvious inconsistencies visible on the page`,
				browser_profile: "stealth",
			},
			controller.signal,
		);

		const raw = result as Partial<LinkedInReport>;

		return {
			profileFound: raw.profileFound ?? true,
			positions: raw.positions ?? [],
			education: raw.education ?? [],
			endorsementsCount: raw.endorsementsCount ?? 0,
			recommendationsCount: raw.recommendationsCount ?? 0,
			discrepancies: raw.discrepancies ?? [],
			summary:
				raw.summary ??
				`LinkedIn profile extracted — ${raw.positions?.length ?? 0} positions found`,
		};
	} finally {
		clearTimeout(timer);
	}
}
