/**
 * Step 5C: Portfolio/Website Agent
 *
 * Scrapes and analyzes a candidate's portfolio website.
 * Assesses freshness and verifies linked projects.
 */
export async function runPortfolioAgent(
	_portfolioUrl: string,
	_requestId: string,
): Promise<Record<string, unknown>> {
	// TODO: Launch Playwright headless browser
	// TODO: Navigate to portfolio URL, wait for JS rendering
	// TODO: Take full-page screenshot
	// TODO: Extract project titles, descriptions, tech stack, links
	// TODO: Check if linked GitHub repos / demos are live
	// TODO: Assess freshness (last modified, copyright year, recent projects)
	// TODO: Return PortfolioReport JSON + screenshot URL
	throw new Error("Not implemented");
}
