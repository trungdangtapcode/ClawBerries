import type { EmployerReport } from "@/shared/types/research.js";
import { callTinyFish } from "../tinyfish-client.js";

const TIMEOUT_MS = 45_000;

/**
 * 5D — Employer Verification Agent (per company)
 *
 * Uses `lite` for initial registry lookup and `stealth` when hitting
 * masothue.com / LinkedIn Company Pages which have bot detection.
 * We use stealth throughout for safety.
 */
export async function runEmployerAgent(
	companyName: string,
	_requestId: string,
): Promise<EmployerReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	// Masothue.com search provides Vietnamese business registry data
	const masothueSearchUrl = `https://masothue.com/tim-kiem/?q=${encodeURIComponent(companyName)}`;

	try {
		const { result } = await callTinyFish(
			{
				url: masothueSearchUrl,
				goal: `Research this Vietnamese company: "${companyName}"

1. Check the current page (masothue.com) for tax code, registration status, and founding date
2. Also search Google for: "${companyName}" site:linkedin.com/company for employee count
3. Search Google for: "${companyName}" recent news reviews Glassdoor

Return structured JSON with:
- companyName: string (normalized official name if found)
- verified: true/false (found in Vietnamese business registry)
- registrationStatus: "active" | "dissolved" | "suspended" | "unknown"
- estimatedHeadcount: number (from LinkedIn or any other source, null if unknown)
- industry: string (primary industry, null if unknown)
- credibilityScore: 0-100 score based on verifiability and consistency
- redFlags: array of strings describing concerns (e.g. "company dissolved", "headcount mismatch")
- summary: one-line verdict`,
				browser_profile: "stealth",
			},
			controller.signal,
		);

		const raw = result as Partial<EmployerReport>;

		return {
			companyName: raw.companyName ?? companyName,
			verified: raw.verified ?? false,
			registrationStatus: raw.registrationStatus ?? "unknown",
			estimatedHeadcount: raw.estimatedHeadcount ?? null,
			industry: raw.industry ?? null,
			credibilityScore: raw.credibilityScore ?? 50,
			redFlags: raw.redFlags ?? [],
			summary:
				raw.summary ??
				`${companyName}: credibility ${raw.credibilityScore ?? 50}/100`,
		};
	} finally {
		clearTimeout(timer);
	}
}
