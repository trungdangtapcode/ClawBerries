# ClawBerries — Job Applicant Research Agent

Automated candidate research agent that takes a PDF resume, extracts structured profile data via multimodal LLM (Gemini), then plans and runs parallel verification agents to cross-check every claim against the open web.

## Architecture

```
PDF CV
 │
 ▼
┌──────────────────────────────────┐
│  Step 3: CV Parser (Gemini OCR)  │  src/modules/parser/cv-parser.ts
│  PDF → base64 → Gemini API      │
│  → PdfOcrResult (structured JSON)│
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│  Step 4: Dispatcher              │  src/modules/parser/dispatcher.ts
│  PdfOcrResult → AgentPlan[]      │
│  → rate limiting → DB tracking   │
│  → Redis progress → TinyFish     │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│  Step 5: Parallel Research       │  src/modules/research/run-research.ts
│  5 agents run simultaneously     │
│  LinkedIn / GitHub / Portfolio   │
│  Employer / Web Search           │
└───────────────┬──────────────────┘
                │ (concurrent)
┌──────────────────────────────────┐
│  Step 6: Progress Reporting      │  src/modules/research/progress.ts
│  Polls Redis every 10 s          │
│  → throttled Telegram messages   │
└───────────────┬──────────────────┘
                │
                ▼
        Results in agent_results table
        → Step 7: LLM Synthesis (upcoming)
```

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres + Redis)
docker-compose up -d

# 3. Set up environment
cp .env.example .env
# Fill in GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, TINYFISH_API_KEY

# 4. Run database migrations
pnpm db:migrate

# 5. Run the pipeline on a CV
set -a; source .env; set +a
pnpm tsx src/index.ts "/path/to/cv.pdf"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for PDF OCR |
| `GEMINI_MODEL` | No | Model name (default: `gemini-3-flash-preview`) |
| `GEMINI_BASE_URL` | No | Override Gemini endpoint |
| `TINYFISH_API_KEY` | Yes | API key for [agent.tinyfish.ai](https://agent.tinyfish.ai) |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `DATABASE_URL` | No | PostgreSQL connection string (gracefully skipped if unavailable) |
| `REDIS_URL` | No | Redis connection string (gracefully skipped if unavailable) |

---

## Module: `src/modules/parser/`

The parser module implements Steps 3 and 4 of the pipeline.

### Files

```
src/modules/parser/
├── index.ts            # Public barrel — re-exports from cv-parser and dispatcher
├── cv-parser.ts        # Step 3: Gemini PDF OCR + structured extraction
└── dispatcher.ts       # Step 4: Agent planning, rate limiting, dispatch
```

### `cv-parser.ts` — Step 3: CV Parsing & Entity Extraction

Sends a PDF to Gemini as base64 inline data and receives a structured `PdfOcrResult` JSON.

**Exports:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `processPdfWithGemini` | `(pdfPath: string, userTask: string, timeoutMs?: number) => Promise<PdfOcrResult>` | Main entry — reads PDF, base64-encodes, calls Gemini, parses JSON response |
| `processPdfWithCodex` | Same as above | Alias for `processPdfWithGemini` |
| `GeminiPdfWorker` | Class with `.process(pdfPath, task)` | Stateful wrapper with configurable timeout |
| `CodexPdfWorker` | Class with `.process(pdfPath, task)` | Alias class for `GeminiPdfWorker` |

**`PdfOcrResult` schema** — what Gemini extracts from the CV:

```typescript
{
  identity: {                        // name, email, phone, location, name variants
    fullName: string;
    nameVariants: string[];          // e.g. ["Nguyen Tien Thang", "Thắng Nguyễn Tiến"]
    email: string | null;
    phone: string | null;
    location: string | null;
  };
  education: EducationEntry[];       // school, degree, field, dates, GPA
  workHistory: WorkEntry[];          // company, title, dates, description
  skills: SkillEntry[];              // name + evidence source (github/portfolio/publication/claim_only)
  links: LinkEntry[];                // every URL found in the PDF with type classification
  publications: PublicationEntry[];  // title, venue, date, co-authors, DOI
  awards: AwardEntry[];              // title, organization, date, rank
  documentMeta: DocumentMeta;        // page count, language
}
```

**How it works:**

1. Validates the file path is a `.pdf` and exists on disk
2. Reads the PDF into a `Buffer` and base64-encodes it
3. Builds a structured extraction prompt (8 JSON sections, strict rules for Vietnamese names/dates)
4. POSTs to `Gemini v1beta generateContent` with `inline_data` (mime: `application/pdf`) and `responseMimeType: application/json`
5. Strips markdown fences from response, unwraps `[{...}]` arrays if Gemini returns one
6. Returns typed `PdfOcrResult`

**Error handling:** Timeout via `AbortController`, blocked-prompt detection, empty-response detection, JSON parse failure with raw output dump.

---

### `dispatcher.ts` — Step 4: Task Planning & Agent Dispatch

Takes a `PdfOcrResult` and generates a concrete list of `AgentPlan[]` — one per verification target — each with a URL to scrape and a prompt describing what to check.

**Exports:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `planAndDispatchAgents` | `(requestId: string, ocrResult: PdfOcrResult) => Promise<AgentPlan[]>` | Full pipeline: plan → rate limit → DB track → Redis progress → TinyFish dispatch |
| `previewAgentTargets` | `(ocrResult: PdfOcrResult) => DispatchPreviewItem[]` | Dry-run — returns `{ type, url, check }` per agent without side effects |
| `planAgentTargets` | `(ocrResult: PdfOcrResult) => AgentPlan[]` | Pure function — builds agent plans from OCR data |

**Agent types and what they verify:**

| Type | Target URL | What it checks |
|------|-----------|----------------|
| `linkedin` | Direct LinkedIn profile URL | Name vs CV, title/company match, employment dates, education, date gaps > 3 months |
| `github` | Direct GitHub profile/repo URL | Repo languages vs claimed skills, commit activity (90 days), notable repos, account age |
| `portfolio` | Direct portfolio site URL | Identity match, projects vs work history, tech stack, freshness, broken links |
| `employer` | Google search: `"CompanyName" Vietnam company` | Business registry, tax lookup, LinkedIn company signals, status/size plausibility |
| `web_search` | Google search: `"Name" company skill1 skill2` | Undisclosed profiles, employer confirmation, conference/award mentions, public presence |
| `publication` | Google Scholar search by title | Title/venue lookup, author list verification, venue indexing, DOI resolution |
| `award` | Google search: `"Award Title" org year winner` | Issuer website winners page, candidate name presence, title consistency |

**Rate limiting:** Per-agent-type daily counters stored in Redis.

| Agent Type | Daily Limit |
|------------|-------------|
| linkedin | 100 |
| github | 4,500 |
| portfolio | 500 |
| employer | 1,000 |
| web_search | 1,000 |
| publication | 1,000 |
| award | 1,000 |

**Timeouts per agent type:**

| Agent Type | Timeout |
|------------|---------|
| linkedin | 45s |
| github | 30s |
| portfolio | 60s |
| employer | 45s |
| web_search | 30s |
| publication | 30s |
| award | 30s |

**Dispatch flow:**
1. `planAgentTargets()` — builds all `AgentPlan[]` from OCR data (pure, no I/O)
2. `applyRateLimits()` — checks Redis counters, drops plans over daily budget
3. `createTrackingRecords()` — batch-inserts `agent_results` rows in Postgres (status: `pending`)
4. `initializeProgress()` — writes `progress:{requestId}` hash + per-agent keys to Redis (24h TTL)
5. `dispatchToTinyFish()` — POSTs each plan to TinyFish in parallel via `Promise.allSettled`

---

## Module: `src/modules/research/`

Implements Steps 5 and 6 of the pipeline. See [`STEP_5_6_WORKFLOW.md`](./STEP_5_6_WORKFLOW.md) for full detail.

### Files

```
src/modules/research/
├── run-research.ts          Step 5 — parallel agent orchestrator
├── progress.ts              Step 6 — live Telegram progress reporter
├── tinyfish-client.ts       TinyFish SSE client (callTinyFish)
└── agents/
    ├── linkedin.ts          5A — LinkedIn profile (stealth browser)
    ├── github.ts            5B — GitHub stats (lite browser)
    ├── portfolio.ts         5C — Portfolio scrape (stealth browser)
    ├── employer.ts          5D — Company registry verification (stealth browser)
    └── web-search.ts        5E — Web mentions search (lite browser)
```

### Step 5 — Parallel Research Execution (`run-research.ts`)

`runResearch(requestId, profile)` orchestrates all agents concurrently:

1. Inserts `agent_results` rows with `status: 'running'`
2. Initialises Redis key `progress:{requestId}` with total agent count and per-agent state
3. Updates `research_requests.status → 'researching'`
4. Runs all agents in parallel via `Promise.allSettled` inside a **120 s global hard deadline** (`Promise.race`)
5. Force-marks any still-running agents as `timeout` after the deadline

All agents call **`POST https://agent.tinyfish.ai/v1/automation/run-sse`** with `{ url, goal, browser_profile }`. SSE is used (not sync) because it supports `AbortSignal` cancellation — required for per-agent timeouts.

**Browser profiles:** `stealth` for LinkedIn / portfolio / employer (bot detection), `lite` for GitHub / web search (plain HTML/JSON).

### Step 6 — Progress Reporting (`progress.ts`)

`reportProgress(requestId, chatId)` runs **concurrently** with `runResearch`, polling Redis every 10 s and sending at most **2 throttled Telegram messages** (minimum 30 s apart). Exits without sending anything if research completes in < 45 s (fast path).

---

## Example Output

```bash
$ pnpm tsx src/index.ts "/path/to/cv.pdf"
```

```
[step 3] Parsing CV: /path/to/cv.pdf
[step 3] Done — extracted Thang Tien Nguyen
[step 4] Planning and dispatching agents (requestId: f79e8888-...)
[step 4] Dispatched 18 agents:
[
  {
    "type": "linkedin",
    "url": "https://linkedin.com/in/thangnt2508",
    "check": "Verify name variants, current title/company, past roles and dates..."
  },
  {
    "type": "github",
    "url": "https://github.com/willingWill17",
    "check": "Check repo languages vs claimed skills, commit activity..."
  },
  {
    "type": "employer",
    "url": "https://www.google.com/search?q=%22iGOT.AI%22%20Vietnam%20company",
    "check": "Verify company existence/status via registries..."
  }
]
```

---

## Database Schema

Defined in `src/shared/db/schema.ts`:

| Table | Purpose |
|-------|---------|
| `research_requests` | One row per CV screening request (`received → researching → done → failed`) |
| `candidate_profiles` | Parsed candidate data linked to a request |
| `agent_results` | One row per dispatched agent (type, target, status, result JSON, timing) |
| `candidate_briefs` | Final synthesized brief (rating, markdown, interview questions) |
| `audit_logs` | Action log for compliance |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM) + TypeScript |
| CV OCR | Google Gemini (multimodal, PDF as base64 inline data) |
| Browser automation | [TinyFish](https://agent.tinyfish.ai) SSE endpoint |
| Telegram Bot | grammY |
| Database | PostgreSQL via Drizzle ORM |
| Cache / Queue | Redis via ioredis |
| LLM synthesis | OpenAI API (Step 7, upcoming) |
| Validation | Zod v4 |
| Build | tsup, tsx |
| Lint | Biome |
| Tests | Vitest (unit + integration) |

---

## Scripts

```bash
pnpm dev              # Start with tsx watch (auto-reload)
pnpm build            # Build with tsup
pnpm start            # Run built dist/index.js
pnpm check            # Biome lint check
pnpm check:fix        # Biome auto-fix
pnpm typecheck        # tsc --noEmit
pnpm test             # Unit tests
pnpm test:watch       # Watch mode
pnpm test:integration # Integration tests (requires docker-compose up -d + .env)
pnpm test:all         # Unit + integration
pnpm test:coverage    # Unit tests with coverage report
pnpm db:generate      # Generate Drizzle migration SQL
pnpm db:migrate       # Apply migrations
pnpm db:studio        # Open Drizzle Studio (database browser)
```

---

## Implementation Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Receive CV via Telegram | ⬜ Planned |
| 2 | Parse CV — extract profile | ⬜ Planned |
| 3 | CV parsing via Gemini OCR | ✅ Done |
| 4 | Agent planning & dispatch | ✅ Done |
| 5 | Parallel research execution | ✅ Done |
| 6 | Live progress reporting | ✅ Done |
| 7 | LLM synthesis & cross-referencing | ⬜ Planned |
| 8 | Deliver final report via Telegram | ⬜ Planned |
