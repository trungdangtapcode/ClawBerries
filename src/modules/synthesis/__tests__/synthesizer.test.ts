import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import type { CandidateBrief } from "@/shared/types/candidate.js";

// ─── Hoist mocks ─────────────────────────────────────────────────────────────

const { dbMock, llmClientMock, mockAgentRows } = vi.hoisted(() => {
	const mockBriefResponse: CandidateBrief = {
		candidateName: "Nguyen Van A",
		overallRating: "yellow",
		summary: "Strong technical profile with one title discrepancy.",
		cvValidity: {
			score: 72,
			totalClaimsChecked: 8,
			verified: 5,
			unverifiable: 1,
			contradicted: 2,
			assessment: "Most claims verified, but title discrepancy at FPT and unverifiable Kubernetes expertise.",
		},
		verifiedClaims: [
			{ claim: "Worked at FPT Software (2021-2023)", status: "verified", evidence: "LinkedIn confirms employment", source: "linkedin" },
			{ claim: "BSc Computer Science, HUST", status: "verified", evidence: "LinkedIn education matches", source: "linkedin" },
		],
		inconsistencies: [
			{ severity: "high", cvClaim: "Tech Lead at FPT Software", evidence: "LinkedIn shows Senior Engineer", source: "linkedin" },
			{ severity: "medium", cvClaim: "Expert in Kubernetes", evidence: "No Kubernetes-related repos found on GitHub", source: "github" },
		],
		gaps: [
			{ type: "skill_gap", description: "Kubernetes expertise claimed but no evidence in GitHub repos", severity: "medium", suggestedQuestion: "Can you describe a production Kubernetes cluster you managed?" },
		],
		interviewMustConfirm: [
			{ topic: "Title at FPT Software", reason: "CV says Tech Lead but LinkedIn says Senior Engineer", suggestedQuestions: ["What was your official title at FPT?"], priority: "must_ask" },
		],
		technicalSnapshot: {
			githubStats: { totalRepos: 23, totalStars: 156, commitsLast90Days: 847 },
			topLanguages: ["Python", "TypeScript"],
			skillsEvidence: { Python: true, Kubernetes: false, AWS: null },
		},
		employerVerifications: [
			{ company: "FPT Software", verified: true, details: "Active, 27000+ employees" },
		],
		interviewQuestions: [
			"Walk me through your role progression at FPT.",
			"Describe a production Kubernetes cluster you managed.",
			"Tell me about your microservice-kit project.",
		],
		sources: ["linkedin.com/in/nva", "github.com/nva"],
	};

	const mockAgentRows = [
		{
			id: "row-1",
			requestId: "req-1",
			agentType: "linkedin",
			agentTarget: "linkedin.com/in/nva",
			status: "completed",
			result: {
				profileFound: true,
				positions: [
					{
						title: "Senior Engineer",
						company: "FPT Software",
						startDate: "2021-01",
						endDate: "2023-06",
					},
				],
				education: [{ school: "HUST", degree: "BSc Computer Science" }],
				endorsementsCount: 15,
				recommendationsCount: 3,
				discrepancies: [
					{
						field: "title",
						cvValue: "Tech Lead",
						linkedinValue: "Senior Engineer",
						severity: "high",
					},
				],
				summary: "Profile found, 1 position",
			},
			errorMessage: null,
			startedAt: new Date("2026-03-21T10:00:00Z"),
			completedAt: new Date("2026-03-21T10:00:30Z"),
		},
		{
			id: "row-2",
			requestId: "req-1",
			agentType: "github",
			agentTarget: "github.com/nva",
			status: "completed",
			result: {
				username: "nva",
				totalRepos: 23,
				totalStars: 156,
				commitsLast90Days: 847,
				topLanguages: [{ language: "Python", percentage: 45 }],
				notableRepos: [],
				skillsEvidence: { Python: true, Kubernetes: false },
				summary: "23 repos, 156 stars",
			},
			errorMessage: null,
			startedAt: new Date("2026-03-21T10:00:00Z"),
			completedAt: new Date("2026-03-21T10:00:20Z"),
		},
		{
			id: "row-3",
			requestId: "req-1",
			agentType: "employer",
			agentTarget: "FPT Software",
			status: "failed",
			result: null,
			errorMessage: "timeout",
			startedAt: new Date("2026-03-21T10:00:00Z"),
			completedAt: new Date("2026-03-21T10:00:45Z"),
		},
	];

	const makeChain = () => ({
		set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
	});
	const makeInsertChain = () => ({
		values: vi.fn(() => Promise.resolve()),
	});
	const makeSelectChain = (rows: unknown[]) => ({
		from: vi.fn(() => ({
			where: vi.fn(() => Promise.resolve(rows)),
		})),
	});

	const dbMock = {
		update: vi.fn(() => makeChain()),
		insert: vi.fn(() => makeInsertChain()),
		select: vi.fn(() => makeSelectChain(mockAgentRows)),
	};

	const llmClientMock = {
		provider: "gemini" as const,
		model: "gemini-3-flash-preview",
		generateJson: vi.fn().mockResolvedValue({
			result: mockBriefResponse,
			model: "gemini-3-flash-preview",
			tokensUsed: 2847,
		}),
	};

	return { dbMock, llmClientMock, mockBriefResponse, mockAgentRows };
});

// ─── vi.mock ─────────────────────────────────────────────────────────────────

vi.mock("@/shared/config/env.js", () => ({
	config: { DATABASE_URL: "postgres://test", REDIS_URL: "redis://test" },
}));

vi.mock("@/shared/db/index.js", () => ({
	db: dbMock,
	schema: {
		agentResults: { requestId: "requestId" },
		researchRequests: {},
		candidateBriefs: {},
		auditLogs: {},
	},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

// ─── Import under test ──────────────────────────────────────────────────────

import { synthesize } from "../synthesizer.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockOcrResult: PdfOcrResult = {
	identity: {
		fullName: "Nguyen Van A",
		nameVariants: ["Nguyen Van A", "A Nguyen"],
		email: "nva@email.com",
		phone: "+84 912 345 678",
		location: "Ho Chi Minh City",
	},
	education: [
		{
			school: "HUST",
			degree: "BSc",
			field: "Computer Science",
			startDate: "2015-09",
			endDate: "2019-06",
			gpa: null,
		},
	],
	workHistory: [
		{
			company: "FPT Software",
			title: "Tech Lead",
			startDate: "2021-01",
			endDate: "2023-06",
			description: "Led backend team",
			companyUrl: null,
		},
	],
	skills: [
		{ name: "Python", evidencedBy: "github" },
		{ name: "Kubernetes", evidencedBy: "claim_only" },
	],
	links: [
		{
			href: "https://linkedin.com/in/nva",
			type: "linkedin",
			text: null,
			page: 1,
		},
		{ href: "https://github.com/nva", type: "github", text: null, page: 1 },
	],
	publications: [],
	awards: [],
	documentMeta: { pageCount: 2, language: "en" },
	document_text: "Nguyen Van A resume content",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("synthesize", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls LLM with assembled research bundle and returns CandidateBrief", async () => {
		const result = await synthesize("req-1", mockOcrResult, llmClientMock);

		expect(result.candidateName).toBe("Nguyen Van A");
		expect(result.overallRating).toBe("yellow");
		expect(result.inconsistencies).toHaveLength(2);
		expect(result.verifiedClaims).toHaveLength(2);
		expect(result.interviewQuestions).toHaveLength(3);
	});

	it("updates research_requests status to synthesizing", async () => {
		await synthesize("req-1", mockOcrResult, llmClientMock);

		expect(dbMock.update).toHaveBeenCalled();
	});

	it("stores brief in candidate_briefs table", async () => {
		await synthesize("req-1", mockOcrResult, llmClientMock);

		// insert called for candidateBriefs and auditLogs
		expect(dbMock.insert).toHaveBeenCalledTimes(2);
	});

	it("passes system prompt and serialized bundle to LLM", async () => {
		await synthesize("req-1", mockOcrResult, llmClientMock);

		const call = llmClientMock.generateJson.mock.calls[0]![0]!;
		expect(call.systemPrompt).toContain("senior HR analyst");
		expect(call.userPrompt).toContain("Nguyen Van A");
		expect(call.userPrompt).toContain("FPT Software");
		expect(call.userPrompt).toContain("RESEARCH RESULTS");
		expect(call.temperature).toBe(0.2);
		expect(call.timeoutMs).toBe(60_000);
	});

	it("throws when no agents returned usable data", async () => {
		// Override select to return only failed agents
		dbMock.select.mockReturnValueOnce({
			from: vi.fn(() => ({
				where: vi.fn(() =>
					Promise.resolve([
						{ ...mockAgentRows[2], id: "row-fail", agentType: "web_search" },
					]),
				),
			})),
		});

		await expect(
			synthesize("req-1", mockOcrResult, llmClientMock),
		).rejects.toThrow("No agents returned usable data");
	});

	it("includes LinkedIn discrepancies in the prompt", async () => {
		await synthesize("req-1", mockOcrResult, llmClientMock);

		const call = llmClientMock.generateJson.mock.calls[0]![0]!;
		expect(call.userPrompt).toContain("LinkedIn Research");
		expect(call.userPrompt).toContain("Senior Engineer");
	});

	it("includes GitHub stats in the prompt", async () => {
		await synthesize("req-1", mockOcrResult, llmClientMock);

		const call = llmClientMock.generateJson.mock.calls[0]![0]!;
		expect(call.userPrompt).toContain("GitHub Research");
		expect(call.userPrompt).toContain("23");
		expect(call.userPrompt).toContain("156");
	});
});
