/**
 * Seed mock agent results and run Step 7 synthesis.
 * Usage: pnpm tsx src/scripts/seed-and-synthesize.ts "./CV.pdf"
 */
import { processPdfWithGemini } from "@/modules/parser/index.js";
import { synthesize } from "@/modules/synthesis/synthesizer.js";
import { db, schema } from "@/shared/db/index.js";

const pdfPath = process.argv[2];
if (!pdfPath) {
	process.stderr.write("Usage: pnpm tsx src/scripts/seed-and-synthesize.ts <path-to-pdf>\n");
	process.exit(1);
}

const now = new Date();
const thirtySecondsAgo = new Date(now.getTime() - 30_000);

(async () => {
	// Step 3: Parse CV
	process.stdout.write(`[step 3] Parsing CV: ${pdfPath}\n`);
	const ocrResult = await processPdfWithGemini(pdfPath, "Extract all structured data from this CV.");
	process.stdout.write(`[step 3] Done — extracted ${ocrResult.identity.fullName}\n`);

	// Create research request
	const [row] = await db
		.insert(schema.researchRequests)
		.values({ telegramChatId: "cli-seed", status: "researching" })
		.returning({ id: schema.researchRequests.id });
	const requestId = row!.id;
	process.stdout.write(`[seed] Created request: ${requestId}\n`);

	// Seed mock agent results
	const mockResults = [
		{
			agentType: "linkedin" as const,
			agentTarget: "https://linkedin.com/in/phat-nguyen-thuan",
			status: "completed" as const,
			result: {
				profileFound: true,
				positions: [
					{ title: "Co-Founder & CTO", company: "Byterover", startDate: "2024-06", endDate: null },
				],
				education: [
					{ school: "University of Information Technology (UIT-VNUHCM)", degree: "Bachelor of Science in Computer Science" },
				],
				endorsementsCount: 12,
				recommendationsCount: 2,
				discrepancies: [],
				summary: "Profile found — 1 position, education verified",
			},
		},
		{
			agentType: "github" as const,
			agentTarget: "https://github.com/RyanNg1403",
			status: "completed" as const,
			result: {
				username: "RyanNg1403",
				totalRepos: 18,
				totalStars: 45,
				commitsLast90Days: 312,
				topLanguages: [
					{ language: "Python", percentage: 40 },
					{ language: "TypeScript", percentage: 30 },
					{ language: "JavaScript", percentage: 20 },
				],
				notableRepos: [
					{ name: "Cipher", stars: 12, forks: 3, language: "TypeScript", description: "AI-powered code review tool" },
				],
				skillsEvidence: {
					Python: true,
					TypeScript: true,
					JavaScript: true,
					PyTorch: true,
					"React/Next.js": true,
					Kubernetes: false,
				},
				summary: "18 repos, 45 stars, 312 commits in 90 days",
			},
		},
		{
			agentType: "employer" as const,
			agentTarget: "Byterover",
			status: "completed" as const,
			result: {
				companyName: "Byterover",
				verified: true,
				registrationStatus: "active",
				estimatedHeadcount: 5,
				industry: "AI / Software Development",
				credibilityScore: 65,
				redFlags: [],
				summary: "Byterover: active startup, ~5 employees, AI/software",
			},
		},
		{
			agentType: "web_search" as const,
			agentTarget: "Phat Nguyen Thuan",
			status: "completed" as const,
			result: {
				candidateName: "Phat Nguyen Thuan",
				mentions: [
					{ url: "https://shrec2025.org", title: "SHREC 2025 — 3D Object Retrieval", type: "conference", snippet: "1st Place: ROOMELSA team" },
					{ url: "https://soict.org/hackathon2024", title: "SoICT Hackathon 2024", type: "award", snippet: "Second Prize — NAVER Track" },
					{ url: "https://aichallenge.hochiminhcity.gov.vn", title: "HCMC AI Challenge 2024", type: "award", snippet: "Second Prize winner" },
				],
				conferenceCount: 1,
				awardCount: 3,
				summary: "3 mentions — 1 conference win, 2 hackathon awards confirmed",
			},
		},
		{
			agentType: "portfolio" as const,
			agentTarget: "https://youtube.com/@byterover",
			status: "completed" as const,
			result: {
				accessible: true,
				projects: [
					{ title: "Byterover YouTube Channel", description: "Tech and AI content", techStack: ["Video"], url: "https://youtube.com/@byterover", isLive: true },
				],
				lastUpdatedYear: 2025,
				freshnessScore: 85,
				screenshotUrl: null,
				summary: "YouTube channel active, 2025 content",
			},
		},
	];

	await db.insert(schema.agentResults).values(
		mockResults.map((r) => ({
			requestId,
			agentType: r.agentType,
			agentTarget: r.agentTarget,
			status: r.status,
			result: r.result,
			startedAt: thirtySecondsAgo,
			completedAt: now,
		})),
	);
	process.stdout.write(`[seed] Inserted ${mockResults.length} mock agent results\n`);

	// Step 7: Synthesize
	process.stdout.write("[step 7] Starting LLM synthesis...\n");
	const brief = await synthesize(requestId, ocrResult);
	process.stdout.write(`[step 7] Done — rating: ${brief.overallRating.toUpperCase()}\n`);
	process.stdout.write(`[step 7] ${brief.summary}\n`);

	if (brief.verifiedClaims.length > 0) {
		process.stdout.write(`\n[step 7] Verified claims (${brief.verifiedClaims.length}):\n`);
		for (const claim of brief.verifiedClaims) {
			process.stdout.write(`  ✅ ${claim.claim} — ${claim.status} (${claim.source})\n`);
		}
	}

	if (brief.inconsistencies.length > 0) {
		process.stdout.write(`\n[step 7] Inconsistencies (${brief.inconsistencies.length}):\n`);
		for (const inc of brief.inconsistencies) {
			process.stdout.write(`  [${inc.severity.toUpperCase()}] ${inc.cvClaim}\n`);
			process.stdout.write(`    Evidence: ${inc.evidence} (${inc.source})\n`);
		}
	}

	if (brief.employerVerifications.length > 0) {
		process.stdout.write("\n[step 7] Employer verifications:\n");
		for (const emp of brief.employerVerifications) {
			process.stdout.write(`  ${emp.verified ? "✅" : "❌"} ${emp.company} — ${emp.details}\n`);
		}
	}

	if (brief.interviewQuestions.length > 0) {
		process.stdout.write("\n[step 7] Interview questions:\n");
		for (let i = 0; i < brief.interviewQuestions.length; i++) {
			process.stdout.write(`  ${i + 1}. ${brief.interviewQuestions[i]}\n`);
		}
	}

	process.stdout.write("\n[step 7] Sources:\n");
	for (const src of brief.sources) {
		process.stdout.write(`  - ${src}\n`);
	}

	process.exit(0);
})().catch((err: unknown) => {
	const msg = err instanceof Error ? err.message : String(err);
	process.stderr.write(`Error: ${msg}\n`);
	process.exit(1);
});
