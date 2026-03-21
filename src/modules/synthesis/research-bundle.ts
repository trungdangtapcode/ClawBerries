import { eq } from "drizzle-orm";
import type { PdfOcrResult } from "@/modules/parser/cv-parser.js";
import { db, schema } from "@/shared/db/index.js";
import type {
	AgentType,
	EmployerReport,
	GitHubReport,
	LinkedInReport,
	PortfolioReport,
	WebSearchReport,
} from "@/shared/types/research.js";

// ─── Lightweight report types for publication & award agents ─────────────────

export interface PublicationReport {
	title: string;
	found: boolean;
	authorMatch: boolean | null;
	venueVerified: boolean | null;
	summary: string;
}

export interface AwardReport {
	title: string;
	found: boolean;
	winnerMatch: boolean | null;
	issuerVerified: boolean | null;
	summary: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResearchBundle {
	candidateProfile: PdfOcrResult;
	linkedinReports: LinkedInReport[];
	githubReports: GitHubReport[];
	portfolioReports: PortfolioReport[];
	employerReports: EmployerReport[];
	webSearchReports: WebSearchReport[];
	publicationReports: PublicationReport[];
	awardReports: AwardReport[];
	metadata: {
		agentsSucceeded: number;
		agentsFailed: number;
		agentsTimedOut: number;
		totalAgents: number;
		totalResearchTimeMs: number;
	};
}

// ─── Assembler ───────────────────────────────────────────────────────────────

/**
 * Fetches all completed agent results from the DB for a request
 * and assembles them into a typed ResearchBundle alongside the
 * original PdfOcrResult from Step 3.
 */
export async function assembleResearchBundle(
	requestId: string,
	ocrResult: PdfOcrResult,
): Promise<ResearchBundle> {
	const rows = await db
		.select()
		.from(schema.agentResults)
		.where(eq(schema.agentResults.requestId, requestId));

	const linkedinReports: LinkedInReport[] = [];
	const githubReports: GitHubReport[] = [];
	const portfolioReports: PortfolioReport[] = [];
	const employerReports: EmployerReport[] = [];
	const webSearchReports: WebSearchReport[] = [];
	const publicationReports: PublicationReport[] = [];
	const awardReports: AwardReport[] = [];

	let succeeded = 0;
	let failed = 0;
	let timedOut = 0;
	let earliestStart = Number.POSITIVE_INFINITY;
	let latestEnd = 0;

	for (const row of rows) {
		if (row.startedAt) {
			earliestStart = Math.min(earliestStart, row.startedAt.getTime());
		}
		if (row.completedAt) {
			latestEnd = Math.max(latestEnd, row.completedAt.getTime());
		}

		if (row.status === "completed" && row.result) {
			succeeded++;
			const data = row.result as Record<string, unknown>;
			const type = row.agentType as AgentType;

			switch (type) {
				case "linkedin":
					linkedinReports.push(data as unknown as LinkedInReport);
					break;
				case "github":
					githubReports.push(data as unknown as GitHubReport);
					break;
				case "portfolio":
					portfolioReports.push(data as unknown as PortfolioReport);
					break;
				case "employer":
					employerReports.push(data as unknown as EmployerReport);
					break;
				case "web_search":
					webSearchReports.push(data as unknown as WebSearchReport);
					break;
				case "publication":
					publicationReports.push(data as unknown as PublicationReport);
					break;
				case "award":
					awardReports.push(data as unknown as AwardReport);
					break;
			}
		} else if (row.status === "failed") {
			failed++;
		} else if (row.status === "timeout") {
			timedOut++;
		}
	}

	const totalResearchTimeMs =
		earliestStart < Number.POSITIVE_INFINITY && latestEnd > 0
			? latestEnd - earliestStart
			: 0;

	return {
		candidateProfile: ocrResult,
		linkedinReports,
		githubReports,
		portfolioReports,
		employerReports,
		webSearchReports,
		publicationReports,
		awardReports,
		metadata: {
			agentsSucceeded: succeeded,
			agentsFailed: failed,
			agentsTimedOut: timedOut,
			totalAgents: rows.length,
			totalResearchTimeMs,
		},
	};
}

// ─── Serializer ──────────────────────────────────────────────────────────────

/**
 * Converts a ResearchBundle into a readable text block for the LLM prompt.
 * Keeps it compact to stay within token budgets.
 */
export function serializeBundleForPrompt(bundle: ResearchBundle): string {
	const sections: string[] = [];
	const profile = bundle.candidateProfile;

	// ── CV Data ────────────────────────────────────────────────────────────
	sections.push("=== CANDIDATE CV DATA ===");
	sections.push(`Name: ${profile.identity.fullName}`);
	if (profile.identity.nameVariants.length > 0) {
		sections.push(`Name variants: ${profile.identity.nameVariants.join(", ")}`);
	}
	if (profile.identity.email) sections.push(`Email: ${profile.identity.email}`);
	if (profile.identity.location)
		sections.push(`Location: ${profile.identity.location}`);

	if (profile.workHistory.length > 0) {
		sections.push("\n-- Work History (from CV) --");
		for (const w of profile.workHistory) {
			const dates = [w.startDate, w.endDate ?? "Present"]
				.filter(Boolean)
				.join(" – ");
			sections.push(`  ${w.title} at ${w.company} (${dates})`);
			if (w.description) sections.push(`    ${w.description.slice(0, 200)}`);
		}
	}

	if (profile.education.length > 0) {
		sections.push("\n-- Education (from CV) --");
		for (const e of profile.education) {
			const degree = [e.degree, e.field].filter(Boolean).join(" in ");
			const dates = [e.startDate, e.endDate].filter(Boolean).join(" – ");
			sections.push(`  ${degree || "Degree"} at ${e.school} (${dates})`);
		}
	}

	if (profile.skills.length > 0) {
		sections.push("\n-- Skills (from CV) --");
		const grouped = {
			evidenced: profile.skills.filter((s) => s.evidencedBy !== "claim_only"),
			claimOnly: profile.skills.filter((s) => s.evidencedBy === "claim_only"),
		};
		if (grouped.evidenced.length > 0) {
			sections.push(
				`  Evidenced: ${grouped.evidenced.map((s) => `${s.name} (${s.evidencedBy})`).join(", ")}`,
			);
		}
		if (grouped.claimOnly.length > 0) {
			sections.push(
				`  Claim only: ${grouped.claimOnly.map((s) => s.name).join(", ")}`,
			);
		}
	}

	if (profile.publications.length > 0) {
		sections.push("\n-- Publications (from CV) --");
		for (const p of profile.publications) {
			sections.push(
				`  "${p.title}" at ${p.venue ?? "unknown venue"} (${p.date ?? "n/d"})`,
			);
		}
	}

	if (profile.awards.length > 0) {
		sections.push("\n-- Awards (from CV) --");
		for (const a of profile.awards) {
			sections.push(
				`  ${a.title}${a.organization ? ` — ${a.organization}` : ""} (${a.date ?? "n/d"})`,
			);
		}
	}

	// ── Agent Results ──────────────────────────────────────────────────────
	sections.push("\n=== RESEARCH RESULTS ===");
	sections.push(
		`Agents: ${bundle.metadata.agentsSucceeded} succeeded, ${bundle.metadata.agentsFailed} failed, ${bundle.metadata.agentsTimedOut} timed out (${bundle.metadata.totalAgents} total)`,
	);
	sections.push(
		`Research duration: ${Math.round(bundle.metadata.totalResearchTimeMs / 1000)}s`,
	);

	if (bundle.linkedinReports.length > 0) {
		sections.push("\n-- LinkedIn Research --");
		for (const r of bundle.linkedinReports) {
			sections.push(`  Profile found: ${r.profileFound}`);
			if ((r.positions?.length ?? 0) > 0) {
				sections.push("  Positions:");
				for (const p of r.positions) {
					sections.push(
						`    ${p.title} at ${p.company} (${p.startDate ?? "?"} – ${p.endDate ?? "Present"})`,
					);
				}
			}
			if ((r.education?.length ?? 0) > 0) {
				sections.push(
					`  Education: ${r.education.map((e) => `${e.degree ?? ""} at ${e.school}`).join("; ")}`,
				);
			}
			sections.push(
				`  Endorsements: ${r.endorsementsCount ?? 0}, Recommendations: ${r.recommendationsCount ?? 0}`,
			);
			if ((r.discrepancies?.length ?? 0) > 0) {
				sections.push("  Discrepancies found by agent:");
				for (const d of r.discrepancies) {
					sections.push(
						`    [${d.severity}] ${d.field}: CV="${d.cvValue}" vs LinkedIn="${d.linkedinValue}"`,
					);
				}
			}
		}
	}

	if (bundle.githubReports.length > 0) {
		sections.push("\n-- GitHub Research --");
		for (const r of bundle.githubReports) {
			sections.push(
				`  Username: ${r.username} | Repos: ${r.totalRepos} | Stars: ${r.totalStars} | Commits (90d): ${r.commitsLast90Days}`,
			);
			if ((r.topLanguages?.length ?? 0) > 0) {
				sections.push(
					`  Top languages: ${r.topLanguages.map((l) => `${l.language} ${l.percentage}%`).join(", ")}`,
				);
			}
			if ((r.notableRepos?.length ?? 0) > 0) {
				sections.push("  Notable repos:");
				for (const repo of r.notableRepos) {
					sections.push(
						`    ${repo.name} (${repo.stars}★, ${repo.forks} forks) — ${repo.description ?? "no description"}`,
					);
				}
			}
			if (Object.keys(r.skillsEvidence ?? {}).length > 0) {
				sections.push(
					`  Skills evidence: ${Object.entries(r.skillsEvidence)
						.map(([k, v]) => `${k}=${v ? "YES" : "NO"}`)
						.join(", ")}`,
				);
			}
		}
	}

	if (bundle.portfolioReports.length > 0) {
		sections.push("\n-- Portfolio Research --");
		for (const r of bundle.portfolioReports) {
			sections.push(
				`  Accessible: ${r.accessible} | Freshness: ${r.freshnessScore}/100 | Last updated: ${r.lastUpdatedYear ?? "unknown"}`,
			);
			if ((r.projects?.length ?? 0) > 0) {
				sections.push("  Projects:");
				for (const p of r.projects) {
					sections.push(
						`    ${p.title} — ${(p.techStack ?? []).join(", ")} ${p.isLive === false ? "(DEAD LINK)" : ""}`,
					);
				}
			}
		}
	}

	if (bundle.employerReports.length > 0) {
		sections.push("\n-- Employer Verification --");
		for (const r of bundle.employerReports) {
			sections.push(
				`  ${r.companyName}: verified=${r.verified}, status=${r.registrationStatus}, headcount=${r.estimatedHeadcount ?? "unknown"}, industry=${r.industry ?? "unknown"}, credibility=${r.credibilityScore}/100`,
			);
			if ((r.redFlags?.length ?? 0) > 0) {
				for (const flag of r.redFlags) {
					sections.push(`    RED FLAG [${flag.type}]: ${flag.detail}`);
				}
			}
		}
	}

	if (bundle.webSearchReports.length > 0) {
		sections.push("\n-- Web Search --");
		for (const r of bundle.webSearchReports) {
			sections.push(
				`  Mentions: ${r.mentions?.length ?? 0} | Conferences: ${r.conferenceCount ?? 0} | Awards: ${r.awardCount ?? 0}`,
			);
			for (const m of (r.mentions ?? []).slice(0, 10)) {
				sections.push(`    [${m.type}] ${m.title} — ${m.url}`);
			}
		}
	}

	if (bundle.publicationReports.length > 0) {
		sections.push("\n-- Publication Verification --");
		for (const r of bundle.publicationReports) {
			sections.push(
				`  "${r.title}": found=${r.found}, authorMatch=${r.authorMatch ?? "unknown"}, venueVerified=${r.venueVerified ?? "unknown"}`,
			);
			if (r.summary) sections.push(`    ${r.summary}`);
		}
	}

	if (bundle.awardReports.length > 0) {
		sections.push("\n-- Award Verification --");
		for (const r of bundle.awardReports) {
			sections.push(
				`  "${r.title}": found=${r.found}, winnerMatch=${r.winnerMatch ?? "unknown"}, issuerVerified=${r.issuerVerified ?? "unknown"}`,
			);
			if (r.summary) sections.push(`    ${r.summary}`);
		}
	}

	return sections.join("\n");
}
