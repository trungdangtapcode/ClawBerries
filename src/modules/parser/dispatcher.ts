// import { db, schema } from "@/shared/db/index.js";
// import { redis } from "@/shared/redis/index.js";
import type { AgentPlan, BrowserProfile } from "@/shared/types/candidate.js";
import type {
	AwardEntry,
	LinkEntry,
	PdfOcrResult,
	PublicationEntry,
	WorkEntry,
} from "./cv-parser.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DispatchPreviewItem = {
	agentType: AgentPlan["type"];
	target: string;
	targetUrl: string;
	timeout: number;
	browserProfile: BrowserProfile;
	prompt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BROWSER_PROFILES: Record<AgentPlan["type"], BrowserProfile> = {
	linkedin: "stealth",
	github: "lite",
	portfolio: "stealth",
	employer: "stealth",
	web_search: "lite",
	publication: "lite",
	award: "lite",
};
const RATE_LIMITS: Record<AgentPlan["type"], number> = {
	linkedin: 100, // daily budget — LinkedIn scraping is expensive
	github: 4500, // GitHub REST API: 5000 req/hr authenticated
	portfolio: 500,
	employer: 1000,
	web_search: 1000,
	publication: 1000,
	award: 1000,
};

const DEFAULT_TIMEOUTS_MS: Record<AgentPlan["type"], number> = {
	linkedin: 240_000, // stealth — complex multi-step extraction
	github: 180_000, // lite — but multi-step (repos, events, languages)
	portfolio: 180_000, // stealth — JS rendering + project extraction
	employer: 180_000, // stealth — registry + company page
	web_search: 120_000, // lite — search + compile
	publication: 120_000, // lite — scholar lookup
	award: 120_000, // lite — verify on issuer site
};

const LOOK_FOR_CHECKS: Record<AgentPlan["type"], string[]> = {
	linkedin: [
		"current_job_title_and_company",
		"employment_dates_vs_cv",
		"education_entries_vs_cv",
		"profile_name_vs_identity_variants",
		"flags:title_mismatch_date_gap_company_missing",
	],
	github: [
		"repo_languages_vs_claimed_skills",
		"commit_activity_last_90_days",
		"notable_repos_stars_forks",
		"account_age_plausibility",
		"flags:skill_mismatch_linked_repo_404",
	],
	portfolio: [
		"title_meta_vs_identity",
		"projects_vs_work_history",
		"tech_stack_vs_skills",
		"freshness_last_modified",
		"flags:non_200_placeholder_broken_links",
	],
	employer: [
		"business_registry_verification",
		"tax_lookup_secondary_confirmation",
		"linkedin_company_page_signals",
		"company_status_and_size_plausibility",
		"flags:not_found_dissolved_size_mismatch",
	],
	web_search: [
		"undisclosed_linkedin_github_profiles",
		"employment_association_confirmation",
		"conference_speaker_award_mentions",
		"publication_public_presence",
		"flags:no_trace_or_conflicting_company",
	],
	publication: [
		"title_venue_lookup",
		"author_list_includes_candidate",
		"venue_indexed_validation",
		"doi_resolution_check",
		"flags:title_or_author_or_venue_mismatch",
	],
	award: [
		"issuer_website_winners_page",
		"candidate_name_presence_for_year",
		"award_title_consistency",
		"flags:award_unverifiable",
	],
};

const LOOK_FOR_PROMPTS: Record<AgentPlan["type"], string> = {
	linkedin:
		"Verify name variants, current title/company, past roles and dates, and education against CV; flag title mismatch, missing employers, or unexplained date gaps over 3 months.",
	github:
		"Check repo languages vs claimed skills, contribution activity in last 90 days, notable repos, and account age; flag skill mismatch or broken claimed GitHub links.",
	portfolio:
		"Validate identity on site, compare projects and tech stack with CV claims, check freshness and outbound links; flag downtime, placeholder content, or stale portfolio.",
	employer:
		"Verify company existence/status via registries, tax sources, and company profile signals; flag dissolved/not-found entities or implausible company-size claims.",
	web_search:
		"Search public web for profile consistency, employer association, publications, talks, and awards; flag conflicting identity/company evidence or no public trace.",
	publication:
		"Verify publication existence by title/venue/DOI, confirm candidate appears in author list, and validate venue credibility; flag title, author, or venue mismatch.",
	award:
		"Verify award on issuer website for the claimed year and title, and confirm candidate appears in winners list; flag unverifiable award claims.",
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function planAndDispatchAgents(
	requestId: string,
	ocrResult: PdfOcrResult,
): Promise<AgentPlan[]> {
	const plannedAgents = planAgentTargets(ocrResult);
	const limitedAgents = await applyRateLimits(plannedAgents);

	// await createTrackingRecords(requestId, limitedAgents);
	// await initializeProgress(requestId, limitedAgents);
	await dispatchToTinyFish(requestId, limitedAgents);

	return limitedAgents;
}

export function previewAgentTargets(
	ocrResult: PdfOcrResult,
): DispatchPreviewItem[] {
	return planAgentTargets(ocrResult)
		.map((plan) => {
			const directUrl = resolveDirectUrl(plan);
			return {
				agentType: plan.type,
				target: plan.target,
				targetUrl: directUrl ?? "https://duckduckgo.com/",
				timeout: plan.timeout,
				browserProfile: plan.browserProfile,
				prompt: directUrl
					? LOOK_FOR_PROMPTS[plan.type]
					: buildSearchGoal(plan),
			};
		})
		.filter((item) => {
			if (isFabricatedUrl(item.targetUrl)) {
				console.warn(
					`[dispatcher] skipping ${item.agentType} — fabricated URL detected: ${item.targetUrl}`,
				);
				return false;
			}
			return true;
		});
}

/** Returns the direct URL from the plan params, or null if none exists. */
function resolveDirectUrl(plan: AgentPlan): string | null {
	const url = plan.params.url as string | undefined;
	return url ?? null;
}

/** Catch fabricated/placeholder URLs that LLMs sometimes generate */
function isFabricatedUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.replace(/^www\./, "");
		return host === "example.com" || host === "example.org" || host === "placeholder.com";
	} catch {
		return false;
	}
}

/**
 * Build a context-rich goal for agents that don't have a direct URL.
 * TinyFish will start at google.com and reason about what to search.
 */
function buildSearchGoal(plan: AgentPlan): string {
	const p = plan.params;

	switch (plan.type) {
		case "employer":
			return [
				`Search for the company "${p.companyName}" to verify it exists.`,
				`Check: is it a real, active company? What industry? Approximate employee count?`,
				p.candidateTitle ? `The candidate claims the role "${p.candidateTitle}".` : "",
				p.startDate ? `Employment period: ${p.startDate} to ${(p.endDate as string) ?? "present"}.` : "",
				`Return JSON: { companyName, verified, registrationStatus, estimatedHeadcount, industry, credibilityScore (0-100), redFlags[], summary }.`,
			].filter(Boolean).join(" ");

		case "web_search": {
			const name = p.fullName as string;
			const company = p.recentCompany as string | null;
			const keywords = (p.keywords as string[]) ?? [];
			return [
				`Search for "${name}"${company ? ` who works/worked at "${company}"` : ""}.`,
				`Find: LinkedIn profile, GitHub profile, conference talks, awards, publications, and any public mentions.`,
				keywords.length > 0 ? `Skills/keywords to look for: ${keywords.join(", ")}.` : "",
				`Return JSON: { candidateName, mentions: [{ url, title, type, snippet }], conferenceCount, awardCount, summary }.`,
			].filter(Boolean).join(" ");
		}

		case "publication": {
			const title = p.title as string;
			const venue = p.venue as string | null;
			const candidateName = p.candidateName as string;
			return [
				`Search Google Scholar or academic databases for the paper "${title}"${venue ? ` published at ${venue}` : ""}.`,
				`Verify: does the paper exist? Is "${candidateName}" listed as an author?`,
				`Check if the venue is a real, indexed conference or journal.`,
				p.doi ? `DOI: ${p.doi}` : "",
				`Return JSON: { title, found, authorMatch, venueVerified, summary }.`,
			].filter(Boolean).join(" ");
		}

		case "award": {
			const title = p.title as string;
			const org = p.organization as string | null;
			const date = p.date as string | null;
			const candidateName = p.candidateName as string;
			return [
				`Search for the award/competition "${title}"${org ? ` organized by ${org}` : ""}${date ? ` in ${date}` : ""}.`,
				`Find the official results page and verify if "${candidateName}" is listed as a winner.`,
				p.rank ? `Claimed rank: ${p.rank}.` : "",
				`Return JSON: { title, found, candidateListed, summary }.`,
			].filter(Boolean).join(" ");
		}

		default:
			return LOOK_FOR_PROMPTS[plan.type];
	}
}

// ─── Agent Planning ───────────────────────────────────────────────────────────

export function planAgentTargets(ocrResult: PdfOcrResult): AgentPlan[] {
	const agents: AgentPlan[] = [];
	const links = dedupeLinksByType(ocrResult.links ?? []);
	const workHistory = ocrResult.workHistory ?? [];
	const companies = uniqueCompanies(workHistory).slice(0, 5);
	const fullName =
		cleanText(ocrResult.identity?.fullName) ?? "Unknown Candidate";
	const nameVariants = uniqueStrings(ocrResult.identity?.nameVariants ?? []);
	const recentCompany = companies[0] ?? null;
	const claimOnlySkills = uniqueStrings(
		(ocrResult.skills ?? [])
			.filter((s) => s.evidencedBy === "claim_only")
			.map((s) => s.name),
	);
	const publications = (ocrResult.publications ?? []).filter((p) =>
		cleanText(p.title),
	);
	const awards = (ocrResult.awards ?? []).filter(
		(a) => cleanText(a.title) || cleanText(a.organization),
	);

	for (const link of links.linkedin) {
		agents.push(
			buildLinkedinPlan(
				link,
				fullName,
				nameVariants,
				workHistory,
				recentCompany,
			),
		);
	}

	for (const link of links.github) {
		agents.push(buildGithubPlan(link, claimOnlySkills));
	}

	for (const link of links.portfolio) {
		agents.push(buildPortfolioPlan(link, fullName, workHistory));
	}

	for (const company of companies) {
		agents.push(buildEmployerPlan(company, workHistory));
	}

	agents.push(
		buildWebSearchPlan(fullName, nameVariants, recentCompany, claimOnlySkills),
	);

	for (const pub of publications) {
		// Only dispatch if we have a direct URL or DOI — Scholar search is acceptable fallback
		agents.push(buildPublicationPlan(pub, fullName, nameVariants));
	}

	for (const award of awards) {
		// Skip awards that have no direct URL and aren't publicly verifiable
		// (e.g. personal certs like IELTS — Google search won't find results)
		if (award.url || award.publiclyVerifiable) {
			agents.push(buildAwardPlan(award, fullName, nameVariants));
		}
	}

	return agents;
}

// ─── Plan Builders ────────────────────────────────────────────────────────────

function buildLinkedinPlan(
	link: LinkEntry,
	fullName: string,
	nameVariants: string[],
	workHistory: WorkEntry[],
	recentCompany: string | null,
): AgentPlan {
	return {
		type: "linkedin",
		target: link.href,
		timeout: DEFAULT_TIMEOUTS_MS.linkedin,
		browserProfile: BROWSER_PROFILES.linkedin,
		params: {
			url: link.href,
			lookFor: LOOK_FOR_CHECKS.linkedin,
			prompt: LOOK_FOR_PROMPTS.linkedin,
			expectedName: fullName,
			nameVariants,
			recentRole: workHistory[0]?.title ?? null,
			recentCompany,
		},
	};
}

function buildGithubPlan(
	link: LinkEntry,
	claimOnlySkills: string[],
): AgentPlan {
	return {
		type: "github",
		target: link.href,
		timeout: DEFAULT_TIMEOUTS_MS.github,
		browserProfile: BROWSER_PROFILES.github,
		params: {
			url: link.href,
			username: extractGithubUsername(link.href),
			lookFor: LOOK_FOR_CHECKS.github,
			prompt: LOOK_FOR_PROMPTS.github,
			claimOnlySkills,
		},
	};
}

function buildPortfolioPlan(
	link: LinkEntry,
	fullName: string,
	workHistory: WorkEntry[],
): AgentPlan {
	return {
		type: "portfolio",
		target: link.href,
		timeout: DEFAULT_TIMEOUTS_MS.portfolio,
		browserProfile: BROWSER_PROFILES.portfolio,
		params: {
			url: link.href,
			lookFor: LOOK_FOR_CHECKS.portfolio,
			prompt: LOOK_FOR_PROMPTS.portfolio,
			expectedName: fullName,
			cvCompanies: workHistory.map((w) => w.company),
		},
	};
}

function buildEmployerPlan(
	company: string,
	workHistory: WorkEntry[],
): AgentPlan {
	const entry = workHistory.find((w) => w.company === company);
	return {
		type: "employer",
		target: company,
		timeout: DEFAULT_TIMEOUTS_MS.employer,
		browserProfile: BROWSER_PROFILES.employer,
		params: {
			companyName: company,
			// Use the company website from the CV if available
			url: entry?.companyUrl ?? null,
			lookFor: LOOK_FOR_CHECKS.employer,
			prompt: LOOK_FOR_PROMPTS.employer,
			candidateTitle: entry?.title ?? null,
			startDate: entry?.startDate ?? null,
			endDate: entry?.endDate ?? null,
		},
	};
}

function buildWebSearchPlan(
	fullName: string,
	nameVariants: string[],
	recentCompany: string | null,
	claimOnlySkills: string[],
): AgentPlan {
	const query = [fullName, recentCompany, ...claimOnlySkills.slice(0, 3)]
		.filter(Boolean)
		.join(" ");
	return {
		type: "web_search",
		target: query,
		timeout: DEFAULT_TIMEOUTS_MS.web_search,
		browserProfile: BROWSER_PROFILES.web_search,
		params: {
			query,
			lookFor: LOOK_FOR_CHECKS.web_search,
			prompt: LOOK_FOR_PROMPTS.web_search,
			fullName,
			nameVariants,
			recentCompany,
			keywords: claimOnlySkills.slice(0, 5),
		},
	};
}

function buildPublicationPlan(
	pub: PublicationEntry,
	fullName: string,
	nameVariants: string[],
): AgentPlan {
	// Prefer: CV url > DOI url > fall back to Scholar search
	const directUrl = pub.url ?? (pub.doi ? `https://doi.org/${pub.doi}` : null);
	const target = directUrl ?? (pub.title ?? "unknown publication");
	return {
		type: "publication",
		target,
		timeout: DEFAULT_TIMEOUTS_MS.publication,
		browserProfile: BROWSER_PROFILES.publication,
		params: {
			url: directUrl,
			lookFor: LOOK_FOR_CHECKS.publication,
			prompt: LOOK_FOR_PROMPTS.publication,
			title: pub.title,
			venue: pub.venue,
			date: pub.date,
			doi: pub.doi,
			candidateName: fullName,
			nameVariants,
		},
	};
}

function buildAwardPlan(
	award: AwardEntry,
	fullName: string,
	nameVariants: string[],
): AgentPlan {
	const target = [award.organization, award.title].filter(Boolean).join(" — ");
	return {
		type: "award",
		target,
		timeout: DEFAULT_TIMEOUTS_MS.award,
		browserProfile: BROWSER_PROFILES.award,
		params: {
			// Use direct URL from CV if available
			url: award.url ?? null,
			lookFor: LOOK_FOR_CHECKS.award,
			prompt: LOOK_FOR_PROMPTS.award,
			title: award.title,
			organization: award.organization,
			date: award.date,
			rank: award.rank,
			candidateName: fullName,
			nameVariants,
		},
	};
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

async function applyRateLimits(plans: AgentPlan[]): Promise<AgentPlan[]> {
	// const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD key (used when Redis rate limiting is re-enabled)
	const counters: Partial<Record<AgentPlan["type"], number>> = {};
	const allowed: AgentPlan[] = [];

	for (const plan of plans) {
		const current = counters[plan.type] ?? 0;
		try {
			// const key = `ratelimit:${plan.type}:${today}`;
			// current = counters[plan.type] ?? (await getRedisCounter(key));
			const limit = RATE_LIMITS[plan.type];
			if (current >= limit) {
				console.warn(
					`[dispatcher] rate limit reached for ${plan.type} (${current}/${limit}), skipping ${plan.target}`,
				);
				continue;
			}
			counters[plan.type] = current + 1;
			// await redis.incr(key);
			// await redis.expireat(key, midnightUnix()); // resets at midnight UTC
		} catch {
			console.warn(
				`[dispatcher] Redis unavailable — skipping rate limit check for ${plan.type}`,
			);
			counters[plan.type] = (counters[plan.type] ?? 0) + 1;
		}
		allowed.push(plan);
	}

	return allowed;
}

// async function getRedisCounter(key: string): Promise<number> {
// 	const val = await redis.get(key);
// 	return val ? Number.parseInt(val, 10) : 0;
// }

// function midnightUnix(): number {
// 	const now = new Date();
// 	const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
// 	return Math.floor(midnight.getTime() / 1000);
// }

// ─── DB Tracking ──────────────────────────────────────────────────────────────

// async function createTrackingRecords(requestId: string, plans: AgentPlan[]): Promise<void> {
// 	if (plans.length === 0) return;
// 	try {
// 		await db.insert(schema.agentResults).values(
// 			plans.map((plan) => ({
// 				requestId,
// 				agentType: plan.type as (typeof schema.agentResults.$inferInsert)["agentType"],
// 				agentTarget: plan.target,
// 				status: "pending" as const,
// 			})),
// 		);
// 	} catch {
// 		console.warn("[dispatcher] DB unavailable — skipping agent tracking records");
// 	}
// }

// ─── Redis Progress ───────────────────────────────────────────────────────────

// async function initializeProgress(requestId: string, plans: AgentPlan[]): Promise<void> {
// 	if (plans.length === 0) return;
// 	try {
// 		const pipeline = redis.pipeline();
// 		const progressKey = `progress:${requestId}`;

// 		pipeline.hset(progressKey, {
// 			total: plans.length,
// 			completed: 0,
// 			failed: 0,
// 			status: "dispatching",
// 		});
// 		pipeline.expire(progressKey, 60 * 60 * 24); // 24h TTL

// 		for (const plan of plans) {
// 			const agentKey = `agent:${requestId}:${plan.type}:${slugify(plan.target)}`;
// 			pipeline.hset(agentKey, { status: "pending", type: plan.type, target: plan.target });
// 			pipeline.expire(agentKey, 60 * 60 * 24);
// 		}

// 		await pipeline.exec();
// 	} catch {
// 		console.warn("[dispatcher] Redis unavailable — skipping progress initialization");
// 	}
// }

// ─── TinyFish Dispatch ────────────────────────────────────────────────────────

async function dispatchToTinyFish(
	requestId: string,
	plans: AgentPlan[],
): Promise<void> {
	const apiUrl = process.env.TINYFISH_API_URL;
	const apiKey = process.env.TINYFISH_API_KEY ?? "";

	if (!apiUrl) {
		console.warn("[dispatcher] TINYFISH_API_URL not set — skipping dispatch");
		return;
	}

	const results = await Promise.allSettled(
		plans.map((plan) => dispatchSingleAgent(apiUrl, apiKey, requestId, plan)),
	);

	const failed = results.filter(
		(r): r is PromiseRejectedResult => r.status === "rejected",
	);
	if (failed.length > 0) {
		console.error(
			`[dispatcher] ${failed.length}/${plans.length} agents failed to dispatch`,
		);
		for (const r of failed) console.error("[dispatcher]", r.reason);
	}
}

async function dispatchSingleAgent(
	apiUrl: string,
	apiKey: string,
	requestId: string,
	plan: AgentPlan,
): Promise<void> {
	const response = await fetch(`${apiUrl}/v1/tasks`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
		},
		body: JSON.stringify({
			requestId,
			agentType: plan.type,
			target: plan.target,
			timeout: plan.timeout,
			params: plan.params,
		}),
		signal: AbortSignal.timeout(10_000), // 10s per dispatch call
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`TinyFish dispatch failed for ${plan.type}:${plan.target} — ${response.status} ${body}`,
		);
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeLinksByType(links: LinkEntry[]): {
	linkedin: LinkEntry[];
	github: LinkEntry[];
	portfolio: LinkEntry[];
} {
	const seen = new Set<string>();
	const result = {
		linkedin: [] as LinkEntry[],
		github: [] as LinkEntry[],
		portfolio: [] as LinkEntry[],
	};

	for (const link of links) {
		if (!link.href) continue;
		const key = normalizeHref(link.href);
		if (seen.has(key)) continue;
		seen.add(key);
		if (link.type === "linkedin") result.linkedin.push(link);
		else if (link.type === "github") result.github.push(link);
		else if (link.type === "portfolio") result.portfolio.push(link);
	}

	return result;
}

function extractGithubUsername(href: string): string | null {
	try {
		const url = new URL(href);
		if (!url.hostname.includes("github.com")) return null;
		return url.pathname.split("/").filter(Boolean)[0] ?? null;
	} catch {
		return null;
	}
}

function uniqueCompanies(workHistory: WorkEntry[]): string[] {
	const seen = new Set<string>();
	const companies: string[] = [];
	for (const entry of workHistory) {
		const name = cleanText(entry.company);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push(name);
	}
	return companies;
}

function uniqueStrings(arr: string[]): string[] {
	return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function cleanText(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeHref(href: string): string {
	try {
		const url = new URL(href);
		return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, "");
	} catch {
		return href.toLowerCase().trim();
	}
}

// function slugify(text: string): string {
// 	return text
// 		.toLowerCase()
// 		.replace(/[^a-z0-9]+/g, "-")
// 		.replace(/^-|-$/g, "")
// 		.slice(0, 64);
// }
