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

export type BrowserProfile = "lite" | "stealth";

export interface AgentPlan {
	type:
		| "linkedin"
		| "github"
		| "portfolio"
		| "employer"
		| "web_search"
		| "publication"
		| "award";
	target: string;
	timeout: number;
	browserProfile: BrowserProfile;
	params: Record<string, unknown>;
}

export type OverallRating = "green" | "yellow" | "red";

export interface Inconsistency {
	severity: "critical" | "high" | "medium" | "low";
	cvClaim: string;
	evidence: string;
	source: string;
}

export interface VerifiedClaim {
	claim: string;
	status: "verified" | "unverifiable" | "contradicted";
	evidence: string;
	source: string;
}

export interface CvGap {
	type: "employment_gap" | "skill_gap" | "education_gap" | "missing_evidence" | "timeline_issue";
	description: string;
	severity: "critical" | "high" | "medium" | "low";
	/** What the HR should ask about this gap */
	suggestedQuestion: string;
}

export interface InterviewMustConfirm {
	topic: string;
	reason: string;
	suggestedQuestions: string[];
	priority: "must_ask" | "should_ask" | "nice_to_ask";
}

export interface CandidateBrief {
	candidateName: string;
	overallRating: OverallRating;
	/** 1-3 sentence executive summary */
	summary: string;

	/** Overall CV validity assessment */
	cvValidity: {
		/** 0-100 score — how much of the CV is backed by external evidence */
		score: number;
		/** Total claims checked */
		totalClaimsChecked: number;
		/** How many were verified */
		verified: number;
		/** How many could not be checked (agent failed/timed out) */
		unverifiable: number;
		/** How many were contradicted by evidence */
		contradicted: number;
		/** Brief narrative on the CV's trustworthiness */
		assessment: string;
	};

	/** Detailed per-claim verification */
	verifiedClaims: VerifiedClaim[];

	/** Inconsistencies found between CV and external evidence */
	inconsistencies: Inconsistency[];

	/** Gaps and concerns identified */
	gaps: CvGap[];

	/** Items the HR must confirm during the interview, ordered by priority */
	interviewMustConfirm: InterviewMustConfirm[];

	technicalSnapshot: {
		githubStats: {
			totalRepos: number;
			totalStars: number;
			commitsLast90Days: number;
		} | null;
		topLanguages: string[];
		/** Mapping of claimed skill → whether evidence was found */
		skillsEvidence: Record<string, boolean | null>;
	};

	employerVerifications: Array<{
		company: string;
		verified: boolean;
		details: string;
	}>;

	/** General interview questions (not tied to specific gaps) */
	interviewQuestions: string[];

	sources: string[];
}
