import type { PortfolioReport } from "@/shared/types/research.js";
import { callTinyFish } from "../tinyfish-client.js";

const TIMEOUT_MS = 60_000;

/**
 * 5C — Portfolio Agent
 *
 * Uses `stealth` browser profile with full JavaScript rendering.
 * Portfolio sites are often React/Next.js SPAs that require JS execution,
 * and some block headless browsers — stealth profile handles both.
 */
export async function runPortfolioAgent(
	portfolioUrl: string,
	_requestId: string,
): Promise<PortfolioReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const { result } = await callTinyFish(
			{
				url: portfolioUrl,
				goal: `Visit this portfolio website (wait for JavaScript to fully render) and extract:
- projects: array of { title, description, techStack[], demoUrl, repoUrl }
- lastUpdatedYear: the most recent year visible (copyright footer, recent project dates, etc.)
- freshnessScore: 0-100 score based on recency (100 = updated this year, 0 = 3+ years old)
- accessible: true/false (was the site reachable and rendered correctly)
- Take a full-page screenshot if possible

Return as structured JSON.`,
				browser_profile: "stealth",
			},
			controller.signal,
		);

		const raw = result as Partial<PortfolioReport>;

		return {
			accessible: raw.accessible ?? true,
			projects: raw.projects ?? [],
			lastUpdatedYear: raw.lastUpdatedYear ?? null,
			freshnessScore: raw.freshnessScore ?? 50,
			screenshotUrl: raw.screenshotUrl ?? null,
			summary:
				raw.summary ??
				`Portfolio: ${raw.projects?.length ?? 0} projects, freshness ${raw.freshnessScore ?? 50}/100`,
		};
	} finally {
		clearTimeout(timer);
	}
}
