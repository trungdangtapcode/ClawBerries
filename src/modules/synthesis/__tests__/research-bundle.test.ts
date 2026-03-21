import { describe, expect, it } from "vitest";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import type { ResearchBundle } from "../research-bundle.js";
import { serializeBundleForPrompt } from "../research-bundle.js";

const mockOcrResult: PdfOcrResult = {
	identity: {
		fullName: "Tran Thi B",
		nameVariants: ["Tran Thi B", "B Tran"],
		email: "ttb@email.com",
		phone: null,
		location: "Hanoi",
	},
	education: [
		{
			school: "VNU",
			degree: "Master",
			field: "AI",
			startDate: "2018-09",
			endDate: "2020-06",
			gpa: { value: 8.5, scale: 10 },
		},
	],
	workHistory: [
		{
			company: "Viettel",
			title: "AI Engineer",
			startDate: "2020-07",
			endDate: null,
			description: "Built ML pipelines",
			companyUrl: null,
		},
		{
			company: "FPT",
			title: "Junior Dev",
			startDate: "2017-06",
			endDate: "2018-08",
			description: null,
			companyUrl: null,
		},
	],
	skills: [
		{ name: "Python", evidencedBy: "github" },
		{ name: "TensorFlow", evidencedBy: "claim_only" },
		{ name: "Docker", evidencedBy: "claim_only" },
	],
	links: [
		{ href: "https://github.com/ttb", type: "github", text: null, page: 1 },
	],
	publications: [
		{
			title: "Deep Learning for NLP",
			venue: "AAAI 2020",
			date: "2020-02",
			coAuthors: ["Prof X"],
			doi: "10.1234/test",
			url: null,
		},
	],
	awards: [
		{
			title: "Best Paper Award",
			organization: "AAAI",
			date: "2020",
			rank: "Winner",
			url: null,
			publiclyVerifiable: true,
		},
	],
	documentMeta: { pageCount: 3, language: "en" },
};

const mockBundle: ResearchBundle = {
	candidateProfile: mockOcrResult,
	linkedinReports: [],
	githubReports: [
		{
			username: "ttb",
			totalRepos: 15,
			totalStars: 42,
			commitsLast90Days: 230,
			topLanguages: [
				{ language: "Python", percentage: 60 },
				{ language: "Jupyter", percentage: 25 },
			],
			notableRepos: [
				{
					name: "ml-pipeline",
					stars: 18,
					forks: 3,
					language: "Python",
					description: "Production ML pipeline",
				},
			],
			skillsEvidence: { Python: true, TensorFlow: false, Docker: true },
			summary: "15 repos, 42 stars",
		},
	],
	portfolioReports: [],
	employerReports: [
		{
			companyName: "Viettel",
			verified: true,
			registrationStatus: "active",
			estimatedHeadcount: 40000,
			industry: "Telecommunications",
			credibilityScore: 95,
			redFlags: [],
			summary: "Viettel: verified, 40k+ employees",
		},
	],
	webSearchReports: [
		{
			candidateName: "Tran Thi B",
			mentions: [
				{
					url: "https://aaai.org/2020/papers",
					title: "AAAI 2020 Papers",
					type: "conference",
					snippet: "Deep Learning for NLP by Tran Thi B",
				},
			],
			conferenceCount: 1,
			awardCount: 1,
			summary: "1 mention, 1 conference, 1 award",
		},
	],
	metadata: {
		agentsSucceeded: 3,
		agentsFailed: 0,
		agentsTimedOut: 1,
		totalAgents: 4,
		totalResearchTimeMs: 87000,
	},
};

describe("serializeBundleForPrompt", () => {
	it("includes candidate identity", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Tran Thi B");
		expect(text).toContain("ttb@email.com");
		expect(text).toContain("Hanoi");
	});

	it("includes work history from CV", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("AI Engineer at Viettel");
		expect(text).toContain("Junior Dev at FPT");
	});

	it("includes education from CV", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Master in AI at VNU");
	});

	it("separates evidenced and claim-only skills", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Evidenced: Python (github)");
		expect(text).toContain("Claim only: TensorFlow, Docker");
	});

	it("includes publications and awards", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Deep Learning for NLP");
		expect(text).toContain("AAAI 2020");
		expect(text).toContain("Best Paper Award");
	});

	it("includes research metadata", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("3 succeeded");
		expect(text).toContain("1 timed out");
		expect(text).toContain("87s");
	});

	it("includes GitHub research results", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("GitHub Research");
		expect(text).toContain("ttb");
		expect(text).toContain("Python 60%");
		expect(text).toContain("ml-pipeline");
		expect(text).toContain("TensorFlow=NO");
		expect(text).toContain("Docker=YES");
	});

	it("includes employer verification", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Viettel");
		expect(text).toContain("verified=true");
		expect(text).toContain("Telecommunications");
		expect(text).toContain("credibility=95/100");
	});

	it("includes web search mentions", () => {
		const text = serializeBundleForPrompt(mockBundle);
		expect(text).toContain("Web Search");
		expect(text).toContain("AAAI 2020 Papers");
		expect(text).toContain("Conferences: 1");
	});

	it("handles empty reports gracefully", () => {
		const emptyBundle: ResearchBundle = {
			...mockBundle,
			githubReports: [],
			employerReports: [],
			webSearchReports: [],
		};
		const text = serializeBundleForPrompt(emptyBundle);
		expect(text).toContain("Tran Thi B");
		expect(text).not.toContain("GitHub Research");
		expect(text).not.toContain("Employer Verification");
	});
});
