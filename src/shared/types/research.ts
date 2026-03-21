/**
 * Typed report interfaces and Redis progress state for research agents.
 * Agents are driven by DispatchPreviewItem[] items from Step 4 (dispatcher).
 * Each item calls callTinyFish({ url, goal, browser_profile }) independently.
 */

// ─── Agent status ────────────────────────────────────────────────────────────

export type AgentStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "timeout";

export type AgentType =
	| "linkedin"
	| "github"
	| "portfolio"
	| "employer"
	| "web_search"
	| "publication"
	| "award";

// ─── Per-agent report types ───────────────────────────────────────────────────

export interface LinkedInPosition {
	title: string;
	company: string;
	startDate: string | null;
	endDate: string | null;
}

export interface LinkedInDiscrepancy {
	field: "title" | "company" | "dates" | "missing_role";
	cvValue: string;
	linkedinValue: string;
	severity: "critical" | "high" | "medium" | "low";
}

export interface LinkedInReport {
	profileFound: boolean;
	positions: LinkedInPosition[];
	education: Array<{ school: string; degree: string | null }>;
	endorsementsCount: number;
	recommendationsCount: number;
	discrepancies: LinkedInDiscrepancy[];
	/** One-line human-readable summary for progress messages */
	summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
	name: string;
	stars: number;
	forks: number;
	language: string | null;
	description: string | null;
}

export interface GitHubReport {
	username: string;
	totalRepos: number;
	totalStars: number;
	commitsLast90Days: number;
	topLanguages: Array<{ language: string; percentage: number }>;
	notableRepos: GitHubRepo[];
	skillsEvidence: Record<string, boolean>;
	/** One-line human-readable summary for progress messages */
	summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioProject {
	title: string;
	description: string | null;
	techStack: string[];
	url: string | null;
	isLive: boolean | null;
}

export interface PortfolioReport {
	accessible: boolean;
	projects: PortfolioProject[];
	lastUpdatedYear: number | null;
	freshnessScore: number; // 0-100
	screenshotUrl: string | null;
	/** One-line human-readable summary for progress messages */
	summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface EmployerRedFlag {
	type:
		| "not_found"
		| "dissolved"
		| "size_mismatch"
		| "industry_mismatch"
		| "suspicious";
	detail: string;
}

export interface EmployerReport {
	companyName: string;
	verified: boolean;
	registrationStatus: "active" | "dissolved" | "unknown";
	estimatedHeadcount: number | null;
	industry: string | null;
	credibilityScore: number; // 0-100
	redFlags: EmployerRedFlag[];
	/** One-line human-readable summary for progress messages */
	summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface WebMention {
	url: string;
	title: string;
	type: "article" | "conference" | "award" | "social" | "other";
	snippet: string | null;
}

export interface WebSearchReport {
	candidateName: string;
	mentions: WebMention[];
	conferenceCount: number;
	awardCount: number;
	/** One-line human-readable summary for progress messages */
	summary: string;
}

// ─── Union type ───────────────────────────────────────────────────────────────

export type AgentReport =
	| LinkedInReport
	| GitHubReport
	| PortfolioReport
	| EmployerReport
	| WebSearchReport;

// ─── Redis progress state ─────────────────────────────────────────────────────

export interface AgentProgressItem {
	agentType: AgentType;
	/** Human-readable target (URL, company name, candidate name) */
	target: string;
	status: AgentStatus;
	/** Populated once the agent completes */
	summary: string | null;
	durationMs: number | null;
}

/**
 * Stored in Redis as `progress:{requestId}`.
 * Serialized/deserialized as JSON.
 */
export interface ResearchProgressState {
	total: number;
	completed: number;
	failed: number;
	timedOut: number;
	startedAt: number; // Unix ms
	agents: AgentProgressItem[];
}
