/**
 * JSON Schema for CandidateBrief — used for structured output with both
 * Gemini (responseJsonSchema) and OpenAI (response_format.json_schema).
 *
 * Follows OpenAI strict mode rules so it works with both providers:
 * - All objects have additionalProperties: false
 * - All properties listed in required
 * - Nullable fields use ["type", "null"] (anyOf for objects)
 */
export const CANDIDATE_BRIEF_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		candidateName: { type: "string" },
		overallRating: { type: "string", enum: ["green", "yellow", "red"] },
		summary: { type: "string" },
		cvValidity: {
			type: "object",
			properties: {
				score: { type: "integer", description: "0-100 overall CV validity score" },
				totalClaimsChecked: { type: "integer" },
				verified: { type: "integer" },
				unverifiable: { type: "integer" },
				contradicted: { type: "integer" },
				assessment: { type: "string", description: "1-2 sentence narrative on CV trustworthiness" },
			},
			required: ["score", "totalClaimsChecked", "verified", "unverifiable", "contradicted", "assessment"],
			additionalProperties: false,
		},
		verifiedClaims: {
			type: "array",
			items: {
				type: "object",
				properties: {
					claim: { type: "string" },
					status: { type: "string", enum: ["verified", "unverifiable", "contradicted"] },
					evidence: { type: "string" },
					source: { type: "string" },
				},
				required: ["claim", "status", "evidence", "source"],
				additionalProperties: false,
			},
		},
		inconsistencies: {
			type: "array",
			items: {
				type: "object",
				properties: {
					severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
					cvClaim: { type: "string" },
					evidence: { type: "string" },
					source: { type: "string" },
				},
				required: ["severity", "cvClaim", "evidence", "source"],
				additionalProperties: false,
			},
		},
		gaps: {
			type: "array",
			items: {
				type: "object",
				properties: {
					type: {
						type: "string",
						enum: ["employment_gap", "skill_gap", "education_gap", "missing_evidence", "timeline_issue"],
					},
					description: { type: "string" },
					severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
					suggestedQuestion: { type: "string" },
				},
				required: ["type", "description", "severity", "suggestedQuestion"],
				additionalProperties: false,
			},
		},
		interviewMustConfirm: {
			type: "array",
			items: {
				type: "object",
				properties: {
					topic: { type: "string" },
					reason: { type: "string" },
					suggestedQuestions: {
						type: "array",
						items: { type: "string" },
					},
					priority: { type: "string", enum: ["must_ask", "should_ask", "nice_to_ask"] },
				},
				required: ["topic", "reason", "suggestedQuestions", "priority"],
				additionalProperties: false,
			},
		},
		technicalSnapshot: {
			type: "object",
			properties: {
				githubStats: {
					anyOf: [
						{
							type: "object",
							properties: {
								totalRepos: { type: "integer" },
								totalStars: { type: "integer" },
								commitsLast90Days: { type: "integer" },
							},
							required: ["totalRepos", "totalStars", "commitsLast90Days"],
							additionalProperties: false,
						},
						{ type: "null" },
					],
				},
				topLanguages: {
					type: "array",
					items: { type: "string" },
				},
				skillsEvidence: {
					type: "object",
					description: "Mapping of skill name to true (found), false (not found), or null (not checked)",
					additionalProperties: {
						anyOf: [{ type: "boolean" }, { type: "null" }],
					},
				},
			},
			required: ["githubStats", "topLanguages", "skillsEvidence"],
			additionalProperties: false,
		},
		employerVerifications: {
			type: "array",
			items: {
				type: "object",
				properties: {
					company: { type: "string" },
					verified: { type: "boolean" },
					details: { type: "string" },
				},
				required: ["company", "verified", "details"],
				additionalProperties: false,
			},
		},
		interviewQuestions: {
			type: "array",
			items: { type: "string" },
			description: "3 general interview questions not tied to specific gaps",
		},
		sources: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: [
		"candidateName",
		"overallRating",
		"summary",
		"cvValidity",
		"verifiedClaims",
		"inconsistencies",
		"gaps",
		"interviewMustConfirm",
		"technicalSnapshot",
		"employerVerifications",
		"interviewQuestions",
		"sources",
	],
	additionalProperties: false,
};
