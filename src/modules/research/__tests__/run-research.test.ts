import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── All vi.mock() calls must use ONLY inline factories (no top-level vars) ───

vi.mock("@/shared/config/env.js", () => ({
	config: {
		TINYFISH_URL: "http://tinyfish.test",
		TINYFISH_API_KEY: "test-key",
		DATABASE_URL: "postgres://test",
		REDIS_URL: "redis://test",
	},
}));

vi.mock("@/shared/db/index.js", () => ({
	db: {
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		})),
		insert: vi.fn(() => ({
			values: vi.fn((rows: unknown[]) => ({
				returning: vi.fn().mockResolvedValue(
					rows.map((_: unknown, i: number) => ({ id: `row-${i}` })),
				),
			})),
		})),
	},
	schema: {
		agentResults: {},
		researchRequests: {},
	},
}));

// Redis mock backed by an in-memory Map
const redisStore = new Map<string, string>();
vi.mock("@/shared/redis/index.js", () => ({
	redis: {
		get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
		set: vi.fn(async (k: string, v: string) => {
			redisStore.set(k, v);
		}),
	},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

// Agent mocks — all resolve immediately with minimal valid data
vi.mock("../agents/linkedin.js", () => ({
	runLinkedInAgent: vi.fn().mockResolvedValue({
		profileFound: true,
		positions: [],
		education: [],
		endorsementsCount: 0,
		recommendationsCount: 0,
		discrepancies: [],
		summary: "ok",
	}),
}));
vi.mock("../agents/github.js", () => ({
	runGitHubAgent: vi.fn().mockResolvedValue({
		username: "test",
		totalRepos: 5,
		totalStars: 10,
		commitsLast90Days: 50,
		topLanguages: [],
		notableRepos: [],
		skillsEvidence: {},
		summary: "5 repos",
	}),
}));
vi.mock("../agents/portfolio.js", () => ({
	runPortfolioAgent: vi.fn().mockResolvedValue({
		accessible: true,
		projects: [],
		lastUpdatedYear: 2024,
		freshnessScore: 80,
		screenshotUrl: null,
		summary: "ok",
	}),
}));
vi.mock("../agents/employer.js", () => ({
	runEmployerAgent: vi.fn().mockResolvedValue({
		companyName: "Acme",
		verified: true,
		registrationStatus: "active",
		estimatedHeadcount: 100,
		industry: "Tech",
		credibilityScore: 90,
		redFlags: [],
		summary: "verified",
	}),
}));
vi.mock("../agents/web-search.js", () => ({
	runWebSearchAgent: vi.fn().mockResolvedValue({
		candidateName: "Test User",
		mentions: [],
		conferenceCount: 0,
		awardCount: 0,
		summary: "0 mentions",
	}),
}));

// ─── Import after all mocks ───────────────────────────────────────────────────

import { runResearch } from "../run-research.js";
import type { CandidateProfile } from "@/shared/types/candidate.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseProfile: CandidateProfile = {
	fullName: "Test User",
	email: "test@test.com",
	phone: null,
	links: {
		linkedin: "https://linkedin.com/in/test",
		github: "https://github.com/test",
		portfolio: null,
	},
	workHistory: [
		{
			company: "Acme",
			title: "Engineer",
			startDate: "2021-01",
			endDate: "2023-01",
			description: null,
		},
	],
	education: [],
	skillsClaimed: ["TypeScript"],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runResearch", () => {
	beforeEach(() => {
		redisStore.clear();
		vi.clearAllMocks();
	});

	it("spawns linkedin + github + employer + web_search agents based on profile", async () => {
		const { runLinkedInAgent } = await import("../agents/linkedin.js");
		const { runGitHubAgent } = await import("../agents/github.js");
		const { runWebSearchAgent } = await import("../agents/web-search.js");

		await runResearch("req-1", baseProfile);

		expect(runLinkedInAgent).toHaveBeenCalledWith(
			"https://linkedin.com/in/test",
			"req-1",
		);
		expect(runGitHubAgent).toHaveBeenCalledWith(
			"https://github.com/test",
			"req-1",
		);
		expect(runWebSearchAgent).toHaveBeenCalledWith("Test User", "Acme", "req-1");
	});

	it("does NOT spawn linkedin agent when profile has no linkedin link", async () => {
		const { runLinkedInAgent } = await import("../agents/linkedin.js");
		const noLinkedIn = {
			...baseProfile,
			links: { ...baseProfile.links, linkedin: null },
		};

		await runResearch("req-2", noLinkedIn);

		expect(runLinkedInAgent).not.toHaveBeenCalled();
	});

	it("initializes Redis progress state with correct total count", async () => {
		await runResearch("req-3", baseProfile);

		const raw = redisStore.get("progress:req-3");
		expect(raw).toBeDefined();
		const state = JSON.parse(raw!);
		// linkedin + github + 1 employer + web_search = 4
		expect(state.total).toBe(4);
		expect(typeof state.completed).toBe("number");
		expect(Array.isArray(state.agents)).toBe(true);
	});

	it("spawns one employer agent per company (max 5)", async () => {
		const { runEmployerAgent } = await import("../agents/employer.js");
		const manyJobs: CandidateProfile = {
			...baseProfile,
			links: { linkedin: null, github: null, portfolio: null },
			workHistory: [
				{ company: "A", title: "E", startDate: null, endDate: null, description: null },
				{ company: "B", title: "E", startDate: null, endDate: null, description: null },
				{ company: "C", title: "E", startDate: null, endDate: null, description: null },
				{ company: "D", title: "E", startDate: null, endDate: null, description: null },
				{ company: "E", title: "E", startDate: null, endDate: null, description: null },
				{ company: "F", title: "E", startDate: null, endDate: null, description: null }, // should be ignored
			],
		};

		await runResearch("req-4", manyJobs);

		expect(runEmployerAgent).toHaveBeenCalledTimes(5);
	});

	it("always spawns web_search agent even with no links", async () => {
		const { runWebSearchAgent } = await import("../agents/web-search.js");
		const noLinks: CandidateProfile = {
			...baseProfile,
			links: { linkedin: null, github: null, portfolio: null },
		};

		await runResearch("req-5", noLinks);

		expect(runWebSearchAgent).toHaveBeenCalledOnce();
	});
});
