export interface WorkHistoryEntry {
	company: string;
	title: string;
	startDate: string | null;
	endDate: string | null;
	description: string | null;
}

export interface EducationEntry {
	school: string;
	degree: string | null;
	graduationYear: number | null;
}

export interface CandidateProfile {
	fullName: string;
	email: string | null;
	phone: string | null;
	links: {
		linkedin: string | null;
		github: string | null;
		portfolio: string | null;
	};
	workHistory: WorkHistoryEntry[];
	education: EducationEntry[];
	skillsClaimed: string[];
}

export interface AgentPlan {
	type: "linkedin" | "github" | "portfolio" | "employer" | "web_search";
	target: string;
	timeout: number;
	params: Record<string, unknown>;
}

export type OverallRating = "green" | "yellow" | "red";

export interface Inconsistency {
	severity: "critical" | "high" | "medium" | "low";
	cvClaim: string;
	evidence: string;
	source: string;
}

export interface CandidateBrief {
	candidateName: string;
	overallRating: OverallRating;
	summary: string;
	verifiedClaims: string[];
	inconsistencies: Inconsistency[];
	technicalSnapshot: {
		githubStats: Record<string, unknown> | null;
		topLanguages: string[];
		skillsEvidence: Record<string, boolean | null>;
	};
	employerVerifications: Array<{
		company: string;
		verified: boolean;
		details: string;
	}>;
	interviewQuestions: string[];
	sources: string[];
}
