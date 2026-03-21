import { eq } from "drizzle-orm";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import { db, schema } from "@/shared/db/index.js";
import type { LlmClient } from "@/shared/llm/index.js";
import { createLlmClient } from "@/shared/llm/index.js";
import type { CandidateBrief } from "@/shared/types/candidate.js";
import {
	assembleResearchBundle,
	serializeBundleForPrompt,
} from "./research-bundle.js";
import { CANDIDATE_BRIEF_SCHEMA } from "./candidate-brief-schema.js";

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior HR analyst performing candidate due diligence.
You will receive:
1. Structured CV data extracted from the candidate's resume
2. Independent research results from automated agents (LinkedIn, GitHub, portfolio, employer registries, web search)

Your job is to cross-reference ALL CV claims against external evidence and produce a comprehensive, structured analysis that HR can act on.

Perform the following:

A) CV VALIDITY — Score how much of the CV is backed by evidence (0-100). Check every verifiable claim: work history, education, skills, publications, awards. For each claim, determine if it is "verified", "unverifiable" (no data available), or "contradicted" (evidence says otherwise).

B) INCONSISTENCIES — Detect title inflation, date mismatches, fabricated companies, unverifiable skills, missing roles. Rate each by severity:
   - "critical": likely fabrication (fake company, fake degree)
   - "high": significant discrepancy (title inflation, major date mismatch)
   - "medium": minor concern (small date gap, skill overclaim)
   - "low": trivial or ambiguous (formatting differences)

C) GAP ANALYSIS — Identify gaps in the candidate's profile:
   - "employment_gap": unexplained periods between jobs
   - "skill_gap": claimed skills with no evidence in GitHub/portfolio
   - "education_gap": education claims that couldn't be verified
   - "missing_evidence": important claims with no supporting data
   - "timeline_issue": overlapping dates, impossible timelines
   For each gap, provide a specific question HR should ask.

D) INTERVIEW MUST-CONFIRM — What MUST the HR confirm in the interview? Prioritize:
   - "must_ask": red flags, contradictions, critical unknowns
   - "should_ask": gaps, unclear claims, areas needing clarification
   - "nice_to_ask": strengths to explore, culture fit signals
   For each item, provide 1-3 specific questions.

E) TRAFFIC LIGHT RATING:
   - "green": claims largely verified, no significant concerns
   - "yellow": some inconsistencies found, proceed with caution
   - "red": serious concerns (fabricated employers, major title inflation, fake credentials)

Return your analysis as a JSON object with this exact structure:
{
  "candidateName": "string",
  "overallRating": "green" | "yellow" | "red",
  "summary": "1-3 sentence executive summary for a busy HR manager",
  "cvValidity": {
    "score": 0-100,
    "totalClaimsChecked": N,
    "verified": N,
    "unverifiable": N,
    "contradicted": N,
    "assessment": "1-2 sentence narrative on CV trustworthiness"
  },
  "verifiedClaims": [
    {
      "claim": "what the CV states",
      "status": "verified" | "unverifiable" | "contradicted",
      "evidence": "what external research found (or why it's unverifiable)",
      "source": "linkedin | github | portfolio | employer | web_search | cv_only"
    }
  ],
  "inconsistencies": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "cvClaim": "what the CV says",
      "evidence": "what external research found",
      "source": "linkedin | github | portfolio | employer | web_search"
    }
  ],
  "gaps": [
    {
      "type": "employment_gap" | "skill_gap" | "education_gap" | "missing_evidence" | "timeline_issue",
      "description": "what the gap is",
      "severity": "critical" | "high" | "medium" | "low",
      "suggestedQuestion": "specific question HR should ask about this gap"
    }
  ],
  "interviewMustConfirm": [
    {
      "topic": "what needs to be confirmed",
      "reason": "why this matters",
      "suggestedQuestions": ["question 1", "question 2"],
      "priority": "must_ask" | "should_ask" | "nice_to_ask"
    }
  ],
  "technicalSnapshot": {
    "githubStats": { "totalRepos": N, "totalStars": N, "commitsLast90Days": N } | null,
    "topLanguages": ["lang1", "lang2"],
    "skillsEvidence": { "SkillName": true | false | null }
  },
  "employerVerifications": [
    { "company": "name", "verified": true | false, "details": "brief status" }
  ],
  "interviewQuestions": [
    "General question 1 not tied to specific gaps...",
    "General question 2...",
    "General question 3..."
  ],
  "sources": ["url1", "url2", ...]
}

Rules:
- Be thorough. Check EVERY claim: each job, each skill, each award, each publication.
- Be objective and evidence-based. Do not speculate beyond what the data shows.
- If a research agent failed or timed out, mark the claim as "unverifiable" — do not penalise the candidate.
- Vietnamese names may have diacritics; match variants (e.g. "Nguyen" = "Nguyễn").
- interviewMustConfirm should be actionable — give HR specific questions they can ask word-for-word.
- Return valid JSON only. No markdown, no commentary outside the JSON.`;

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Step 7: LLM Synthesis & Cross-Referencing
 *
 * Assembles all research results, sends them to the LLM for
 * cross-reference analysis, and returns a structured CandidateBrief.
 */
export async function synthesize(
	requestId: string,
	ocrResult: PdfOcrResult,
	llmClient?: LlmClient,
): Promise<CandidateBrief> {
	const client = llmClient ?? createLlmClient();

	// 1. Update status → synthesizing
	await db
		.update(schema.researchRequests)
		.set({ status: "synthesizing" })
		.where(eq(schema.researchRequests.id, requestId));

	// 2. Assemble all research data
	const bundle = await assembleResearchBundle(requestId, ocrResult);

	if (bundle.metadata.agentsSucceeded === 0) {
		throw new Error(
			`No agents returned usable data for request ${requestId}. ` +
				`${bundle.metadata.agentsFailed} failed, ${bundle.metadata.agentsTimedOut} timed out.`,
		);
	}

	// 3. Serialize bundle into prompt text
	const userPrompt = serializeBundleForPrompt(bundle);

	// 4. Call LLM with structured output schema
	const { result, model, tokensUsed } =
		await client.generateJson<CandidateBrief>({
			systemPrompt: SYSTEM_PROMPT,
			userPrompt,
			temperature: 0.2,
			timeoutMs: 60_000, // structured output may need more time
			responseSchema: CANDIDATE_BRIEF_SCHEMA,
		});

	// 5. Store brief in DB
	await db.insert(schema.candidateBriefs).values({
		requestId,
		overallRating: result.overallRating,
		briefMarkdown: formatBriefAsMarkdown(result),
		inconsistenciesCount: result.inconsistencies.length,
		verifiedClaimsCount: result.verifiedClaims.length,
		interviewQuestions: result.interviewQuestions,
		modelUsed: model,
		tokensUsed,
	});

	// 6. Log to audit
	await db.insert(schema.auditLogs).values({
		requestId,
		action: "synthesis_completed",
		details: {
			model,
			tokensUsed,
			overallRating: result.overallRating,
			inconsistenciesCount: result.inconsistencies.length,
			verifiedClaimsCount: result.verifiedClaims.length,
			researchAgentsSucceeded: bundle.metadata.agentsSucceeded,
		},
	});

	return result;
}

// ─── Markdown formatter ──────────────────────────────────────────────────────

function formatBriefAsMarkdown(brief: CandidateBrief): string {
	const lines: string[] = [];
	const ratingEmoji = { green: "🟢", yellow: "🟡", red: "🔴" }[brief.overallRating];

	lines.push(`# Candidate Brief: ${brief.candidateName}`);
	lines.push(`\n## ${ratingEmoji} Overall: ${brief.overallRating.toUpperCase()}`);
	lines.push(brief.summary);

	// CV Validity
	if (brief.cvValidity) {
		const v = brief.cvValidity;
		lines.push(`\n## CV Validity Score: ${v.score}/100`);
		lines.push(`Claims checked: ${v.totalClaimsChecked} | Verified: ${v.verified} | Unverifiable: ${v.unverifiable} | Contradicted: ${v.contradicted}`);
		lines.push(v.assessment);
	}

	// Verified Claims
	if (brief.verifiedClaims.length > 0) {
		lines.push("\n## Claim Verification");
		for (const c of brief.verifiedClaims) {
			const icon = c.status === "verified" ? "✅" : c.status === "contradicted" ? "❌" : "❓";
			lines.push(`- ${icon} **${c.claim}** — ${c.evidence} (${c.source})`);
		}
	}

	// Inconsistencies
	if (brief.inconsistencies.length > 0) {
		lines.push("\n## Inconsistencies");
		for (const inc of brief.inconsistencies) {
			lines.push(`- **[${inc.severity.toUpperCase()}]** ${inc.cvClaim}`);
			lines.push(`  Evidence: ${inc.evidence} (source: ${inc.source})`);
		}
	}

	// Gaps
	if (brief.gaps?.length > 0) {
		lines.push("\n## Gaps & Concerns");
		for (const gap of brief.gaps) {
			lines.push(`- **[${gap.severity.toUpperCase()}] ${gap.type}**: ${gap.description}`);
			lines.push(`  Ask: _"${gap.suggestedQuestion}"_`);
		}
	}

	// Interview Must-Confirm
	if (brief.interviewMustConfirm?.length > 0) {
		lines.push("\n## Interview Must-Confirm");
		for (const item of brief.interviewMustConfirm) {
			lines.push(`\n### [${item.priority.toUpperCase()}] ${item.topic}`);
			lines.push(`Reason: ${item.reason}`);
			for (const q of item.suggestedQuestions) {
				lines.push(`- _"${q}"_`);
			}
		}
	}

	// Technical Snapshot
	if (brief.technicalSnapshot?.topLanguages?.length > 0 || brief.technicalSnapshot?.githubStats) {
		lines.push("\n## Technical Snapshot");
		if (brief.technicalSnapshot.githubStats) {
			const s = brief.technicalSnapshot.githubStats;
			lines.push(`GitHub: ${s.totalRepos} repos | ${s.totalStars} stars | ${s.commitsLast90Days} commits (90d)`);
		}
		if (brief.technicalSnapshot.topLanguages.length > 0) {
			lines.push(`Top languages: ${brief.technicalSnapshot.topLanguages.join(", ")}`);
		}
		const evidence = brief.technicalSnapshot.skillsEvidence;
		if (evidence && Object.keys(evidence).length > 0) {
			const parts = Object.entries(evidence).map(
				([skill, found]) => `${skill}: ${found === true ? "YES" : found === false ? "NO" : "?"}`,
			);
			lines.push(`Skills evidence: ${parts.join(" | ")}`);
		}
	}

	// Employer Verification
	if (brief.employerVerifications.length > 0) {
		lines.push("\n## Employer Verification");
		for (const emp of brief.employerVerifications) {
			lines.push(`- ${emp.verified ? "✅" : "❌"} ${emp.company} — ${emp.details}`);
		}
	}

	// General Interview Questions
	if (brief.interviewQuestions.length > 0) {
		lines.push("\n## General Interview Questions");
		for (let i = 0; i < brief.interviewQuestions.length; i++) {
			lines.push(`${i + 1}. ${brief.interviewQuestions[i]}`);
		}
	}

	// Sources
	if (brief.sources.length > 0) {
		lines.push("\n## Sources");
		for (const src of brief.sources) {
			lines.push(`- ${src}`);
		}
	}

	return lines.join("\n");
}
