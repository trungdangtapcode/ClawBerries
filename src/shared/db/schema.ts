import {
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

// Enums
export const requestStatusEnum = pgEnum("request_status", [
	"received",
	"parsing",
	"researching",
	"synthesizing",
	"delivered",
	"failed",
]);

export const agentTypeEnum = pgEnum("agent_type", [
	"linkedin",
	"github",
	"portfolio",
	"employer",
	"web_search",
	"publication",
	"award",
]);

export const agentStatusEnum = pgEnum("agent_status", [
	"pending",
	"running",
	"completed",
	"failed",
	"timeout",
]);

export const overallRatingEnum = pgEnum("overall_rating", [
	"green",
	"yellow",
	"red",
]);

// Tables
export const researchRequests = pgTable("research_requests", {
	id: uuid().primaryKey().defaultRandom(),
	telegramChatId: varchar("telegram_chat_id", { length: 64 }).notNull(),
	telegramMessageId: integer("telegram_message_id"),
	originalFileName: varchar("original_file_name", { length: 255 }),
	fileStoragePath: text("file_storage_path"),
	status: requestStatusEnum().notNull().default("received"),
	requestedAt: timestamp("requested_at").notNull().defaultNow(),
	completedAt: timestamp("completed_at"),
});

export const candidateProfiles = pgTable("candidate_profiles", {
	id: uuid().primaryKey().defaultRandom(),
	requestId: uuid("request_id")
		.notNull()
		.references(() => researchRequests.id),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	email: varchar("email", { length: 255 }),
	phone: varchar("phone", { length: 32 }),
	linksLinkedin: text("links_linkedin"),
	linksGithub: text("links_github"),
	linksPortfolio: text("links_portfolio"),
	workHistory: jsonb("work_history").default([]),
	education: jsonb("education").default([]),
	skillsClaimed: jsonb("skills_claimed").default([]),
	rawExtraction: jsonb("raw_extraction"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const agentResults = pgTable("agent_results", {
	id: uuid().primaryKey().defaultRandom(),
	requestId: uuid("request_id")
		.notNull()
		.references(() => researchRequests.id),
	agentType: agentTypeEnum("agent_type").notNull(),
	agentTarget: text("agent_target"),
	status: agentStatusEnum().notNull().default("pending"),
	result: jsonb("result"),
	errorMessage: text("error_message"),
	startedAt: timestamp("started_at").notNull().defaultNow(),
	completedAt: timestamp("completed_at"),
});

export const candidateBriefs = pgTable("candidate_briefs", {
	id: uuid().primaryKey().defaultRandom(),
	requestId: uuid("request_id")
		.notNull()
		.references(() => researchRequests.id),
	overallRating: overallRatingEnum("overall_rating").notNull(),
	briefMarkdown: text("brief_markdown").notNull(),
	briefPdfUrl: text("brief_pdf_url"),
	inconsistenciesCount: integer("inconsistencies_count").notNull().default(0),
	verifiedClaimsCount: integer("verified_claims_count").notNull().default(0),
	interviewQuestions: jsonb("interview_questions").default([]),
	modelUsed: varchar("model_used", { length: 64 }),
	tokensUsed: integer("tokens_used"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const formSubmissions = pgTable("form_submissions", {
	id: uuid().primaryKey().defaultRandom(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	email: varchar("email", { length: 255 }).notNull(),
	originalFileName: varchar("original_file_name", { length: 255 }),
	storagePath: text("storage_path").notNull(),
	tallyResponseId: varchar("tally_response_id", { length: 64 }),
	requestId: uuid("request_id").references(() => researchRequests.id),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid().primaryKey().defaultRandom(),
	requestId: uuid("request_id").references(() => researchRequests.id),
	action: varchar("action", { length: 64 }).notNull(),
	details: jsonb("details"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
