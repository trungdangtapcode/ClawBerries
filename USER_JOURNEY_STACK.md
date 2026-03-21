# User Journey Stack — Job Applicant Research Agent

> Every step below defines: **WHAT** it is, **WHY** it exists, **WHO** owns it, **WHAT TO DO**, and **EXIT CRITERIA** before moving to the next step.

---

## Journey Overview (30,000-foot view)

```
  HR MANAGER                    SYSTEM                           DATA SOURCES
  ══════════                    ══════                           ════════════

  ┌─────────────┐
  │ STEP 1      │
  │ TRIGGER     │──── CV + command ────▶ ┌─────────────────┐
  │ (Telegram)  │                        │ STEP 2           │
  └─────────────┘              ◀── ack ──│ INTAKE &         │
                                         │ ACKNOWLEDGMENT   │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ STEP 3           │
                                         │ CV PARSING &     │
                                         │ ENTITY EXTRACT   │
                                         └────────┬────────┘
                                                  │ CandidateProfile
                                         ┌────────▼────────┐
                                         │ STEP 4           │
                                         │ TASK PLANNING &  │──── spawns ────▶ ┌──────────────┐
                                         │ DISPATCH         │                  │ STEP 5       │
                                         └────────┬────────┘                  │ PARALLEL     │
                                                  │                           │ RESEARCH     │
  ┌─────────────┐               progress updates  │                           │ (TinyFish)   │
  │ STEP 6      │◀──────────────────────────── ───┤                           └──────┬───────┘
  │ PROGRESS    │                                  │                                  │
  │ REPORTING   │                                  │◀──── agent results ──────────────┘
  └─────────────┘                         ┌────────▼────────┐
                                         │ STEP 7           │
                                         │ LLM SYNTHESIS    │
                                         │ & CROSS-CHECK    │
                                         └────────┬────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ STEP 8           │
                                         │ BRIEF ASSEMBLY   │
                                         │ & FORMATTING     │
                                         └────────┬────────┘
                                                  │
  ┌─────────────┐                        ┌────────▼────────┐
  │ STEP 9      │◀──── final brief ──────│ STEP 9           │
  │ DELIVERY    │                        │ DELIVERY         │
  │ (Telegram)  │                        │ (OpenClaw)       │
  └──────┬──────┘                        └─────────────────┘
         │
  ┌──────▼──────┐
  │ STEP 10     │
  │ POST-       │──── actions ───▶ [PDF / Share / ATS / Calendar]
  │ DELIVERY    │
  │ ACTIONS     │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ STEP 11     │
  │ DATA        │──── retention ──▶ [Cleanup / Audit / Analytics]
  │ LIFECYCLE   │
  └─────────────┘
```

---

## STEP 1: TRIGGER

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 1 — TRIGGER                                                │
│  Owner: HR Manager          Platform: Telegram                    │
│  Duration: ~5 seconds       Engine: OpenClaw Bot                  │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
The entry point where an HR manager initiates a candidate screening request through Telegram.

### Why does it exist?
HR managers live in Telegram (especially in Vietnamese companies). Meeting them where they already work eliminates friction. No new app to learn, no dashboard to log into.

### What to do:

| Action | Input Format | Example |
|--------|-------------|---------|
| **Forward a CV** | PDF/DOCX attachment + optional message | _[attaches CV]_ "Screen this person before Thursday's interview" |
| **Type a command** | `/screen` + attachment | `/screen` _[attaches CV]_ |
| **Quick lookup** | `/quick` + name + links | `/quick Nguyen Van A github.com/nva linkedin.com/in/nva` |
| **Send text only** | Plain text with candidate info | "Check this candidate: Tran Thi B, worked at FPT, GitHub is github.com/ttb" |
| **Voice message** | Voice note describing the request | 🎤 "Screen the CV I just sent, interview is tomorrow" |

### Input validation rules:
- At least one of: CV file, candidate name, or profile link must be present
- Supported file formats: `.pdf`, `.docx`, `.doc`
- Max file size: 20MB
- If ambiguous, bot asks: _"I found a file but no screening command. Would you like me to screen this candidate?"_

### Exit criteria:
✅ A valid screening request is identified (file or text with extractable candidate info)
✅ Request is logged in `research_requests` table with status `pending`
✅ Move to **Step 2**

---

## STEP 2: INTAKE & ACKNOWLEDGMENT

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 2 — INTAKE & ACKNOWLEDGMENT                                │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: < 3 seconds      Engine: OpenClaw                      │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
The system receives the request, validates it, creates a tracking record, and sends an immediate acknowledgment back to the HR manager.

### Why does it exist?
Users need instant feedback that their request was received. A 3-minute silent wait feels broken. This step sets expectations and builds trust.

### What to do:

1. **Receive & validate** the Telegram message (check for CV or extractable info)
2. **Create research request** record in PostgreSQL:
   ```sql
   INSERT INTO research_requests (tenant_id, telegram_chat_id, telegram_message_id,
     candidate_name, cv_file_url, deadline, status, priority)
   VALUES (..., 'pending', ...);
   ```
3. **Parse deadline** from natural language:
   - "before Thursday's interview" → `deadline = next Thursday 09:00`
   - "urgent" / "ASAP" → `priority = 1`
   - No deadline mentioned → `priority = 5` (normal)
4. **Store CV file** to object storage (S3/MinIO), save URL
5. **Send acknowledgment message** immediately:
   ```
   🔍 Got it! Starting research on the attached CV...
   ⏱️ Estimated completion: ~2 minutes
   📋 Request ID: #RR-20260321-001
   ```

### Exit criteria:
✅ Request record exists in database with status `pending`
✅ CV file stored securely
✅ HR manager received acknowledgment message in Telegram
✅ Move to **Step 3**

---

## STEP 3: CV PARSING & ENTITY EXTRACTION

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 3 — CV PARSING & ENTITY EXTRACTION                         │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 10–20 seconds    Engine: Gemini (multimodal PDF)       │
│  Budget: 20 sec of 3-min SLA                                      │
│  Impl: src/features/step3-step4/codex-pdf-ocr.ts                  │
│        src/features/step3-step4/step3-cv-parser.ts                │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
The system extracts structured candidate data from the raw CV PDF. Two extraction paths run in sequence:

1. **Fast path** (`step3-cv-parser.ts`) — regex-based extraction directly on the raw buffer. Works for text-native PDFs in milliseconds. Produces a `CandidateProfile` for immediate dispatch.
2. **Deep path** (`codex-pdf-ocr.ts`) — sends the PDF as base64 to the Gemini API (multimodal). Produces a richer `PdfOcrResult` with 9 structured sections. Used when the fast path yields insufficient data, or always for full validation.

### Why does it exist?
Everything downstream depends on knowing: Who is this person? Where did they work? What links do they have? Without structured extraction, no agents can be dispatched.

### What to do:

1. **Receive PDF path** and validate:
   - Extension must be `.pdf`
   - File must exist and be readable
   - Fail fast with a user-facing error message if either check fails

2. **Fast path — regex extraction** (`parseCvFromBuffer` / `parseCvFromPdfPath`):
   - Decode buffer as UTF-8, fallback to latin1
   - Extract `email` via regex `[\w.+-]+@[\w.-]+`
   - Extract `phone` via regex `(?:\+?84|0)[\d\s.-]{8,10}`, normalize to `+84...`
   - Extract all URLs via regex, classify into `linkedin` / `github` / `portfolio`
   - Infer `fullName` from first 10 lines (skip blacklisted section headers)
   - Infer `workHistory` from lines containing a year + separator pattern (`at` / `-` / `|`)
   - Infer `education` from lines matching school keywords (`university`, `hust`, `hcmut`, etc.)
   - Infer `skillsClaimed` by matching against a known-skills dictionary
   - Validate `workHistory` dates (chronological, within 1950–present)

3. **Deep path — Gemini multimodal extraction** (`processPdfWithGemini`):
   - Read PDF as base64, POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
   - Model: `GEMINI_MODEL` env var (default: `gemini-2.5-flash`)
   - Prompt instructs Gemini to return a **9-section JSON** (`PdfOcrResult`):

   | Section | Key fields | Notes |
   |---------|-----------|-------|
   | `identity` | `fullName`, `nameVariants`, `email`, `phone`, `location` | nameVariants include diacritic + non-diacritic forms |
   | `education[]` | `school`, `degree`, `field`, `startDate`, `endDate`, `gpa{value,scale}` | Dates in `YYYY-MM` format |
   | `workHistory[]` | `company`, `title`, `startDate`, `endDate`, `description` | Most recent first; `endDate: null` = current |
   | `skills[]` | `name`, `evidencedBy` | `evidencedBy`: `github` / `portfolio` / `publication` / `claim_only` |
   | `links[]` | `href`, `type`, `text`, `page` | Every `mailto:`, `tel:`, `http://`, `https://` href found |
   | `publications[]` | `title`, `venue`, `date`, `coAuthors[]`, `doi` | Academic papers, conference proceedings |
   | `awards[]` | `title`, `organization`, `date`, `rank` | Prizes, scholarships, honors |
   | `documentMeta` | `pageCount`, `language` | Language: `"en"`, `"vi"`, etc. |

4. **Parse and validate Gemini response**:
   - Strip any markdown code fences (` ```json `) before `JSON.parse`
   - Throw with raw output if JSON parse fails
   - Abort and throw a timeout error if response exceeds `timeoutMs` (default: 5 min)

5. **Store profile** in `candidate_profiles` table

6. **Update acknowledgment** (amend Telegram message):
   ```
   🔍 Starting research on Nguyễn Văn A...
   📄 CV parsed: 2 jobs, 6 links found, 7 skills (3 evidenced by GitHub)
   🚀 Dispatching research agents now...
   ```

### Key implementation details:
- `GEMINI_API_KEY` loaded from `.env` via `dotenv.config()` at module load
- `GEMINI_MODEL` and `GEMINI_BASE_URL` are overridable via env vars
- Timeout is enforced via `AbortController` + `setTimeout`
- `step3-cv-parser.ts` exposes a CLI entrypoint: `pnpm tsx step3-cv-parser.ts <path>.pdf`
- `codex-pdf-ocr.ts` exposes `GeminiPdfWorker` class and `processPdfWithGemini` function

### Error handling:
| Error | Action |
|-------|--------|
| File not found | Throw `PDF file not found: <path>` |
| Not a `.pdf` extension | Throw `Expected a PDF file path` |
| Missing `GEMINI_API_KEY` | Throw `Missing GEMINI_API_KEY` |
| Gemini API non-2xx | Throw with status code + response body |
| Gemini blocked request | Throw `Gemini blocked request: <reason>` |
| Empty Gemini response | Throw `Gemini returned empty content` |
| JSON parse failure | Throw with raw output for debugging |
| Request timeout | Throw `Gemini OCR request timed out after Xms` |
| Fast path: no text extractable | Throw `Unable to extract text from CV` |
| Fast path: insufficient data | Throw `CV parsing produced insufficient profile data` |

### Exit criteria:
✅ `PdfOcrResult` JSON is complete with `identity.fullName` and at least one of: `workHistory`, `links`, `skills`, or `publications`
✅ Profile stored in `candidate_profiles` table
✅ HR manager sees updated message with extraction summary
✅ Move to **Step 4**

---

## STEP 4: TASK PLANNING & DISPATCH

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 4 — TASK PLANNING & DISPATCH                               │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: < 2 seconds      Engine: OpenClaw → TinyFish           │
│  Budget: ~2 sec of 3-min SLA                                      │
│  Input: PdfOcrResult (from Step 3)                                │
│  Impl: src/features/step3-step4/step4-dispatcher.ts               │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Takes the `PdfOcrResult` from Step 3 and produces a **cronjob target list** — one entry per website/source to check. Each target carries a URL (or search query), a timeout, and a list of things to look for. The targets are then written to the Redis dispatch queue (`tinyfish:dispatch_queue`) and tracked in the `agent_results` DB table.

### Why does it exist?
Not every candidate has a GitHub. Not every CV has portfolio links. Blindly launching all agents wastes resources and time. This step reads exactly what Step 3 found and generates only the targets that make sense to check.

### Step 3 fields consumed:

| `PdfOcrResult` field | Used for |
|---------------------|----------|
| `links[]` where `type = "linkedin"` | LinkedIn agent target URL |
| `links[]` where `type = "github"` | GitHub agent target URL + username |
| `links[]` where `type = "portfolio"` | Portfolio scrape target URL |
| `links[]` where `type = "publication"` | Publication DOI / venue lookup URL |
| `workHistory[].company` (max 5) | One employer verification job per company |
| `identity.fullName` | Web search query base |
| `workHistory[0].company` | Appended to web search query |
| `publications[].title` + `.venue` | Google Scholar / Crossref lookup |
| `awards[].organization` | Award issuer verification URL |

### What to do:

1. **Build the cronjob target list** from `PdfOcrResult`:

   | Source condition | Agent type | Target | Timeout |
   |-----------------|-----------|--------|---------|
   | `links` has `type=linkedin` | `linkedin` | LinkedIn profile URL | 45 s |
   | `links` has `type=github` | `github` | GitHub profile URL | 30 s |
   | `links` has `type=portfolio` | `portfolio` | Portfolio site URL | 60 s |
   | `workHistory[]` non-empty | `employer` × N | Company name (max 5 most recent) | 45 s |
   | Always | `web_search` | `identity.fullName` + most recent company | 30 s |
   | No links at all | `web_search` (enhanced) | Name + each nameVariant → searches LinkedIn/GitHub | 30 s |

2. **What each cronjob looks for** at its target:

   **`linkedin` — `https://linkedin.com/in/{handle}`**
   - Current job title and company → compare against `workHistory[0].title` and `.company`
   - Employment dates for each position → compare against `workHistory[*].startDate` / `endDate`
   - Education entries → compare against `education[*].school` and `.degree`
   - Profile name → compare against `identity.fullName` and `nameVariants`
   - 🚩 Flag: title mismatch (e.g. CV says "Tech Lead", LinkedIn says "Senior Engineer")
   - 🚩 Flag: date gap > 3 months unexplained
   - 🚩 Flag: company present on CV but absent on LinkedIn

   **`github` — `https://github.com/{username}`**
   - Repository languages → compare against `skills[*].name` where `evidencedBy = "claim_only"`
   - Commit activity (last 90 days) → flag if CV claims active engineering work but zero commits
   - Notable repos (stars > 10, forks > 5) → surface as verified project evidence
   - Account age → flag if account created recently (< 6 months) for a claimed senior engineer
   - Repo names/descriptions → cross-reference with `workHistory[*].description` project claims
   - 🚩 Flag: claimed skill has zero matching repo language usage
   - 🚩 Flag: linked repo in CV (`links[type=github]`) returns 404

   **`portfolio` — `{portfolio URL}`**
   - Page title and meta description → compare with `identity.fullName`
   - Listed projects → cross-reference with `workHistory[*].description`
   - Tech stack mentions → compare against `skills[*].name`
   - Last-modified header / copyright year → flag if > 18 months stale
   - All outbound links → check if GitHub/demo links are live (HTTP HEAD)
   - 🚩 Flag: site returns non-200 (domain expired, server down)
   - 🚩 Flag: no projects visible or placeholder content

   **`employer` — business registry + LinkedIn Company**
   - Vietnamese Business Registry (`dangkykinhdoanh.gov.vn`) → verify company name, tax ID, status
   - `masothue.com` → tax code lookup as secondary confirmation
   - LinkedIn Company page → employee count, industry, founded year
   - Check: company size plausibility vs CV role claim (e.g. "led 50-person team" at 8-person company)
   - Check: company still active (not dissolved)
   - Check: industry matches role description
   - 🚩 Flag: company not found in any registry
   - 🚩 Flag: company dissolved before candidate's stated end date
   - 🚩 Flag: employee count far below claimed team size

   **`web_search` — SerpAPI / Google**
   - `"{fullName}" site:linkedin.com OR site:github.com` → find undisclosed profiles
   - `"{fullName}" "{recentCompany}"` → confirm employment association
   - `"{fullName}" conference OR speaker OR award` → surface public achievements
   - `"{fullName}" "{publicationTitle}"` → verify publications exist publicly
   - Enhanced mode (no links found): additionally search all `nameVariants`
   - 🚩 Flag: name appears on LinkedIn with a different company than CV claims
   - 🚩 Flag: web search finds no trace of person at all (very junior or fake identity)

   **`publication` — Google Scholar / Crossref / Semantic Scholar**
   - Triggered when `publications[]` is non-empty in Step 3 result
   - Look up `publications[*].title` + `publications[*].venue`
   - Check: paper exists with candidate listed as author → verify `coAuthors` match
   - Check: venue is a real indexed conference/journal
   - Check: `doi` resolves to the correct paper
   - 🚩 Flag: paper not found under that title
   - 🚩 Flag: candidate's name absent from the author list
   - 🚩 Flag: venue not indexed (predatory/fake conference)

   **`award` — organization website**
   - Triggered when `awards[]` is non-empty
   - Search `"{award.organization}" "{award.title}" winners {award.date}`
   - Check: organization website has a winners/results page for that year
   - Check: candidate's name appears on that page
   - 🚩 Flag: award cannot be verified on the issuing organization's site

3. **Check rate limits** (Redis) before each dispatch:
   ```
   GET rate:linkedin:{YYYYMMDDHH}  →  cap 100/hour → dispatchMode: "queued"
   GET rate:github:{YYYYMMDDHH}    →  cap 4500/hour → dispatchMode: "queued"
   GET rate:portfolio:{YYYYMMDDHH} →  cap 500/hour
   GET rate:employer:{YYYYMMDDHH}  →  cap 1000/hour
   GET rate:web_search:{YYYYMMDDHH}→  cap 1000/hour
   ```
   Jobs exceeding the cap are written to the queue with `dispatchMode: "queued"` instead of `"running"`.

4. **Write tracking records** to `agent_results` table:
   ```sql
   INSERT INTO agent_results (request_id, agent_type, agent_target, status, started_at)
   VALUES
     ($req_id, 'linkedin',   'https://linkedin.com/in/thangnt2508', 'running', NOW()),
     ($req_id, 'github',     'https://github.com/willingWill17',     'running', NOW()),
     ($req_id, 'employer',   'iGOT.AI',                              'running', NOW()),
     ($req_id, 'employer',   'Byterover',                            'running', NOW()),
     ($req_id, 'web_search', 'Thang Tien Nguyen',                    'running', NOW());
   ```

5. **Push jobs to Redis dispatch queue**:
   ```json
   {
     "requestId": "uuid",
     "agentType": "github",
     "target": "https://github.com/willingWill17",
     "timeout": 30000,
     "jobId": "uuid:github:2",
     "dispatchedAt": "2026-03-21T10:00:00.000Z",
     "params": {
       "url": "https://github.com/willingWill17",
       "dispatchMode": "running"
     }
   }
   ```
   Queue key: `tinyfish:dispatch_queue` (Redis list, `RPUSH`)

6. **Initialize progress tracker** in Redis:
   ```
   SET progress:{requestId}  '{"total": 6, "completed": 0, "agents": [...]}'
   EXPIRE progress:{requestId}  600
   ```

### Exit criteria:
✅ Cronjob target list built from `PdfOcrResult` — one entry per verifiable data point
✅ All jobs pushed to `tinyfish:dispatch_queue`
✅ Tracking rows inserted into `agent_results` with `status = "running"`
✅ Progress key initialized in Redis with 10-min TTL
✅ Move to **Step 5** (agents run) + **Step 6** (progress reporting, concurrent)

---

## STEP 5: PARALLEL RESEARCH EXECUTION

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 5 — PARALLEL RESEARCH EXECUTION                            │
│  Owner: TinyFish Agents     Platform: TinyFish Workers            │
│  Duration: 30–120 seconds   Engine: TinyFish                      │
│  Budget: 120 sec hard timeout                                     │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Multiple TinyFish agents run simultaneously, each researching a different data source. This is the core intelligence-gathering phase.

### Why does it exist?
Sequential research would take 5-10 minutes. Parallel execution hits the 3-minute SLA. Each source provides a different facet of the candidate's profile — together they form a complete picture.

### TinyFish API — how agents are dispatched

All agents use the **SSE streaming endpoint** (not sync) because SSE supports `AbortSignal` cancellation, which is required for per-agent timeouts.

```
POST https://agent.tinyfish.ai/v1/automation/run-sse
X-API-Key: <TINYFISH_API_KEY>
Content-Type: application/json

{
  "url": "<starting URL for the agent>",
  "goal": "<natural-language extraction instructions>",
  "browser_profile": "lite" | "stealth"
}
```

**Browser profile per agent:**
| Agent | Profile | Reason |
|-------|---------|--------|
| LinkedIn | `stealth` | Bot detection, login walls |
| GitHub | `lite` | Plain GitHub REST API JSON |
| Portfolio | `stealth` | JS-rendered SPAs, hosting bot detection |
| Employer | `stealth` | masothue.com + LinkedIn Company Pages |
| Web Search | `lite` | Standard Google HTML results |

**SSE event stream:**
```
data: {"type":"STARTED","run_id":"run-abc123"}

data: {"type":"PROGRESS","purpose":"Clicking submit button"}

data: {"type":"COMPLETE","run_id":"run-abc123","status":"COMPLETED","result":{...}}
```

The client resolves on `COMPLETE`. If `status` is `FAILED`, a `TinyFishError` is thrown.

> **Note:** TinyFish may return `COMPLETED` even for unreachable pages, embedding error info in `result` rather than using `status: FAILED`.

### What to do — per agent:

#### 5A: LinkedIn Agent
| Step | Action | Tool |
|------|--------|------|
| 1 | Call TinyFish SSE with LinkedIn URL, `browser_profile: stealth` | TinyFish `/v1/automation/run-sse` |
| 2 | Extract: positions, education, endorsements, recommendations | TinyFish goal prompt |
| 3 | Compare positions against CV `work_history[]` | Diff logic |
| 4 | Flag discrepancies: title mismatches, date gaps, missing roles | Severity tagging |
| 5 | Return `LinkedInReport` JSON | — |
| **Timeout** | 45 sec | **Fallback**: partial data / empty defaults |

#### 5B: GitHub Agent
| Step | Action | Tool |
|------|--------|------|
| 1 | Call TinyFish SSE starting at `https://api.github.com/users/{username}`, `browser_profile: lite` | TinyFish `/v1/automation/run-sse` |
| 2 | Fetch repos and events via goal instructions | TinyFish goal prompt |
| 3 | Calculate: top languages, commit frequency, star count | Aggregation in goal |
| 4 | Cross-reference claimed skills against actual languages used | Diff logic |
| 5 | Return `GitHubReport` JSON | — |
| **Timeout** | 30 sec | **Fallback**: partial data / empty defaults |

#### 5C: Portfolio Agent
| Step | Action | Tool |
|------|--------|------|
| 1 | Call TinyFish SSE with portfolio URL, `browser_profile: stealth` | TinyFish `/v1/automation/run-sse` |
| 2 | Wait for JS rendering (SPA support via stealth browser) | TinyFish agent |
| 3 | Extract: project titles, descriptions, tech stack, freshness | TinyFish goal prompt |
| 4 | Return `PortfolioReport` JSON + optional screenshot URL | — |
| **Timeout** | 60 sec | **Fallback**: `accessible: false`, empty projects |

#### 5D: Employer Verification Agent (per company)
| Step | Action | Tool |
|------|--------|------|
| 1 | Call TinyFish SSE starting at masothue.com search URL, `browser_profile: stealth` | TinyFish `/v1/automation/run-sse` |
| 2 | Extract: tax code, registration status, founding date | TinyFish goal prompt |
| 3 | Also search Google/LinkedIn for employee count and recent news | TinyFish goal prompt |
| 4 | Calculate credibility score (0-100) | Weighted scoring in goal |
| 5 | Flag: company doesn't exist, dissolved, size mismatch | Red flag logic |
| 6 | Return `EmployerReport` JSON | — |
| **Timeout** | 45 sec | **Fallback**: `verified: false`, credibility 50, empty flags |

#### 5E: Web Search Agent
| Step | Action | Tool |
|------|--------|------|
| 1 | Call TinyFish SSE starting at Google search for candidate name, `browser_profile: lite` | TinyFish `/v1/automation/run-sse` |
| 2 | Run multiple searches: general, LinkedIn/GitHub, conferences/awards | TinyFish goal prompt |
| 3 | Compile findings: articles, mentions, conference talks, awards | Aggregation |
| 4 | Return `WebSearchReport` JSON | — |
| **Timeout** | 30 sec | **Fallback**: return whatever results gathered |

### Actual orchestration (TypeScript)

```typescript
// src/modules/research/run-research.ts
export async function runResearch(requestId: string, profile: CandidateProfile) {
  const tasks = buildTasks(profile);              // determine which agents to run

  await db.insert(agentResults).values(            // create 'running' DB rows
    tasks.map(t => ({ requestId, agentType: t.agentType, agentTarget: t.target, status: 'running' }))
  );

  await redis.set(`progress:${requestId}`, JSON.stringify({
    total: tasks.length, completed: 0, failed: 0, timedOut: 0,
    startedAt: Date.now(), agents: [...running]
  }), 'EX', 600);

  await db.update(researchRequests).set({ status: 'researching' });

  // Run all in parallel with a 120 s global hard deadline
  await Promise.race([
    Promise.allSettled(tasks.map(t => t.run())),   // each agent has its own AbortController
    new Promise(r => setTimeout(r, 120_000)),
  ]);

  // Force-mark any still-running agents as timed out
}
```

### Agent result handling:
```
For EACH agent that completes:
  1. Update agent_results table: status → 'completed', result → JSON, completedAt → now
  2. Update Redis progress counter: completed += 1, agent.status, agent.summary
  3. If agent FAILED: status → 'failed', error_message → reason
  4. If agent TIMED OUT (AbortError): status → 'timeout'
  5. After 120 s global race: any still 'running' → force 'timeout'
```

### Exit criteria:
✅ All agents completed, failed, or timed out (hard limit: 120 seconds)
✅ Each agent's result stored in `agent_results` table
✅ Redis `progress:{requestId}` reflects final state of all agents
✅ At least 1 agent returned usable data (otherwise → early failure path)
✅ Move to **Step 7**

---

## STEP 6: PROGRESS REPORTING (concurrent with Step 5)

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 6 — PROGRESS REPORTING                                     │
│  Owner: OpenClaw Engine     Platform: Telegram                    │
│  Duration: Runs during Step 5   Engine: OpenClaw                  │
│  Concurrency: Parallel with research execution                    │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Real-time progress updates sent to the HR manager while research agents are running.

### Why does it exist?
A 2-minute wait with no feedback feels like the system is broken. Progress updates maintain trust and give the HR manager useful early signals (e.g., "LinkedIn verified" = already valuable info).

### What to do:

1. **Poll Redis progress tracker** every 10 seconds
2. **Send progress update** at ~50% completion (or after 60 seconds, whichever comes first):
   ```
   📊 Progress: 3/5 agents complete
   ✅ LinkedIn — profile found, 3 positions verified
   ✅ GitHub — 847 commits, 23 repos analyzed
   ✅ Employer — FPT Software verified (27,000+ employees)
   ⏳ Portfolio — scraping nva.dev...
   ⏳ Web search — searching public mentions...
   ```
3. **If any critical finding surfaces early**, send immediately:
   ```
   ⚠️ Early finding: LinkedIn title is "Senior Engineer" but CV says "Tech Lead" at FPT Software
   ```

### Message throttling:
- Max 2 progress messages (avoid spam)
- Minimum 30 seconds between messages
- Skip progress message if research completes in < 45 seconds total

### Exit criteria:
✅ HR manager is informed of progress (or research was fast enough to skip)
✅ This step ends when Step 5 completes

---

## STEP 7: LLM SYNTHESIS & CROSS-REFERENCING

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 7 — LLM SYNTHESIS & CROSS-REFERENCING                     │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 15–30 seconds    Engine: LLM (Claude Sonnet/Opus)      │
│  Budget: 30 sec of 3-min SLA                                      │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
The LLM receives ALL research results and the original CV, then performs intelligent cross-referencing, inconsistency detection, and generates an analysis.

### Why does it exist?
Raw data from 5 agents is noise. The LLM transforms scattered data points into a coherent narrative with actionable insights. This is where "data" becomes "intelligence."

### What to do:

1. **Assemble the `ResearchBundle`**:
   ```json
   {
     "candidate_profile": { ... },      // From Step 3
     "linkedin_report": { ... },         // From Step 5A
     "github_report": { ... },           // From Step 5B
     "portfolio_report": { ... },        // From Step 5C
     "employer_reports": [ ... ],        // From Step 5D
     "web_search_findings": [ ... ],     // From Step 5E
     "metadata": {
       "agents_succeeded": 4,
       "agents_failed": 1,
       "total_research_time_ms": 87000
     }
   }
   ```

2. **Run Cross-Reference Analysis** (LLM prompt):
   ```
   You are a senior HR analyst. Given the candidate's CV data and
   independent research from multiple sources, perform the following:

   A) VERIFY each CV claim against external evidence
   B) DETECT inconsistencies (title inflation, date mismatches,
      fabricated companies, unverifiable skills)
   C) RATE each inconsistency by severity: critical / high / medium / low
   D) IDENTIFY strengths evidenced by external data but NOT on the CV
   E) GENERATE 3 tailored interview questions targeting gaps
   F) PRODUCE an overall traffic-light rating (🟢 / 🟡 / 🔴)
   ```

3. **Specific cross-checks performed**:

   | CV Claim | Checked Against | Discrepancy Example |
   |----------|----------------|---------------------|
   | "Tech Lead at FPT, 2021-2023" | LinkedIn: "Senior Engineer, 2021-2023" | Title inflation → **High** |
   | "Built microservices platform" | GitHub: no relevant repos | Unverifiable → **Medium** |
   | "Expert in Kubernetes" | GitHub: 0 k8s-related code | Skill overclaim → **Medium** |
   | "BSc Computer Science, HUST" | LinkedIn: same | ✅ Verified |
   | "Led 20-person team at FPT" | FPT has 27,000 employees | Plausible → ✅ |

4. **Generate interview questions** targeting gaps:
   - Gap: Title discrepancy → _"Can you walk me through your exact role progression at FPT? What was your official title vs. your day-to-day responsibilities?"_
   - Gap: Unverifiable skill → _"You listed Kubernetes expertise. Can you describe a production cluster you managed — how many nodes, what orchestration challenges?"_
   - Strength probe → _"Your GitHub shows strong Python contributions. Can you talk about the microservice-kit project and the design decisions behind it?"_

5. **Select model based on candidate seniority**:
   | Seniority Signal | Model | Reason |
   |-----------------|-------|--------|
   | Junior (< 3 years exp) | Claude Sonnet 4.6 | Fast, cost-effective |
   | Mid/Senior (3-10 years) | Claude Sonnet 4.6 | Good balance |
   | Executive / Director | Claude Opus 4.6 | Nuanced analysis needed |

### Exit criteria:
✅ All cross-references completed
✅ Inconsistencies identified and severity-rated
✅ Interview questions generated
✅ Overall rating assigned (🟢🟡🔴)
✅ Move to **Step 8**

---

## STEP 8: BRIEF ASSEMBLY & FORMATTING

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 8 — BRIEF ASSEMBLY & FORMATTING                            │
│  Owner: OpenClaw Engine     Platform: Server-side                 │
│  Duration: 3–5 seconds      Engine: OpenClaw (template engine)    │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Takes the LLM synthesis output and formats it into a polished, scannable brief optimized for Telegram delivery + a PDF version.

### Why does it exist?
Raw LLM output is too long and inconsistent for Telegram. This step applies a strict template that HR managers can scan in 30 seconds.

### What to do:

1. **Apply Telegram-optimized template**:
   ```markdown
   ═══════════════════════════════════
   📋 CANDIDATE BRIEF: Nguyễn Văn A
   🕐 Researched: 21 Mar 2026 | ⏱️ 2m 14s
   ═══════════════════════════════════

   🟡 OVERALL: PROCEED WITH CAUTION
   Strong technical profile, but title discrepancy
   found between CV and LinkedIn. 4/5 claims verified.

   ── ✅ VERIFIED CLAIMS ──────────────
   • Worked at FPT Software (2021-2023) ✓
   • BSc Computer Science, HUST ✓
   • Active GitHub: 847 commits/year, Python-heavy ✓
   • Portfolio site live with 5 projects ✓

   ── ⚠️ INCONSISTENCIES ─────────────
   🔴 HIGH: CV says "Tech Lead" at FPT, LinkedIn
      shows "Senior Engineer"
   🟡 MED: Claims Kubernetes expertise, no evidence
      in public GitHub repos
   🟡 MED: Portfolio last updated Jun 2024 (9 months ago)

   ── 📊 TECHNICAL SNAPSHOT ───────────
   GitHub: 23 repos | 156 ⭐ | Top: Python 45%, TS 30%
   Notable: microservice-kit (89⭐)
   Skills evidence: Python ✓ | K8s ✗ | AWS ~partial

   ── 🏢 EMPLOYERS ────────────────────
   FPT Software: ✅ Verified | 27,000+ emp | IT Services
   ABC Startup:  ✅ Verified | ~50 emp | Fintech

   ── 🎯 INTERVIEW QUESTIONS ─────────
   1. "Walk me through your role progression at FPT.
       What was your official title?"
   2. "Describe a production Kubernetes cluster you
       managed. How many nodes?"
   3. "Tell me about your microservice-kit project —
       what problem does it solve?"

   ── 📎 SOURCES ──────────────────────
   🔗 linkedin.com/in/nva
   🔗 github.com/nva
   🔗 nva.dev
   ═══════════════════════════════════
   ```

2. **Generate PDF version**:
   - Convert markdown brief to styled PDF (company branding)
   - Include screenshots (portfolio, GitHub contribution graph)
   - Store in S3, generate signed URL (24-hour expiry)

3. **Store brief**:
   ```sql
   INSERT INTO candidate_briefs (request_id, overall_rating, brief_markdown,
     brief_pdf_url, inconsistencies_count, verified_claims_count,
     interview_questions, model_used, tokens_used)
   VALUES ($req_id, 'yellow', $markdown, $pdf_url, 3, 4, $questions,
     'claude-sonnet-4-6', 2847);
   ```

4. **Calculate Telegram message chunking**:
   - Telegram max message: 4096 characters
   - If brief > 4096 chars: split into 2 messages (main brief + details)
   - Always keep the first message under 4096 (it has the rating + key findings)

### Exit criteria:
✅ Telegram-formatted brief ready
✅ PDF generated and stored
✅ Brief record saved in database
✅ Move to **Step 9**

---

## STEP 9: DELIVERY

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 9 — DELIVERY                                               │
│  Owner: OpenClaw Engine     Platform: Telegram                    │
│  Duration: < 2 seconds      Engine: OpenClaw → Telegram Bot API   │
│  SLA CHECK: Total elapsed must be < 3 minutes                     │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
The final candidate brief is delivered to the HR manager on Telegram, completing the core workflow.

### Why does it exist?
This is the payoff. All prior steps culminate in this moment — the HR manager gets actionable intelligence before their interview.

### What to do:

1. **Send the formatted brief** (from Step 8) as a Telegram message
2. **Attach inline action buttons** (Telegram InlineKeyboardMarkup):
   ```
   [📥 Download PDF]  [🔄 Deep Dive]
   [📧 Share with Team]  [📅 Schedule Interview]
   ```
3. **Update request status**:
   ```sql
   UPDATE research_requests
   SET status = 'delivered', completed_at = NOW()
   WHERE id = $req_id;
   ```
4. **Log delivery metrics**:
   - Total elapsed time (trigger → delivery)
   - Agents completed vs. failed
   - Inconsistencies found
   - Model used + tokens consumed

5. **If SLA breached** (> 3 minutes):
   - Log SLA breach event for monitoring
   - Still deliver (late is better than never)
   - Append note: _"⏱️ This research took longer than usual due to slow external sources"_

### Exit criteria:
✅ HR manager has the brief in their Telegram chat
✅ Action buttons are visible and functional
✅ Request status = `delivered` in database
✅ Metrics logged
✅ Core journey complete — move to **Step 10** (optional actions)

---

## STEP 10: POST-DELIVERY ACTIONS

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 10 — POST-DELIVERY ACTIONS                                 │
│  Owner: HR Manager (trigger) + OpenClaw (execute)                 │
│  Duration: On-demand         Engine: OpenClaw                     │
│  Trigger: Inline button press or follow-up command                │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Optional follow-up actions the HR manager can take after receiving the brief. These extend the value of the research.

### Why does it exist?
The brief is step one. HR managers need to share it, schedule interviews, or dig deeper. Meeting those needs in Telegram keeps everything in one place.

### What to do (per action):

| Button | What Happens | Implementation |
|--------|-------------|----------------|
| **📥 Download PDF** | Send the pre-generated PDF as a Telegram document | Retrieve from S3, send via `sendDocument` API |
| **🔄 Deep Dive** | Launch extended research: conference talks, publications, patents, academic citations | Spawn additional TinyFish agents → deliver supplementary report in ~5 min |
| **📧 Share with Team** | Forward the brief to a pre-configured HR team channel or specific colleagues | Send to configured `team_channel_id` or prompt for recipient |
| **📅 Schedule Interview** | Open a calendar integration to book the interview | Google Calendar API / Outlook integration → propose 3 time slots |
| **🗄️ Save to ATS** | Push structured candidate data to the company's ATS | API integration: Greenhouse, Lever, BambooHR, or custom webhook |

### Follow-up commands:
| Command | Action |
|---------|--------|
| `/compare <candidate1> <candidate2>` | Side-by-side comparison of two researched candidates |
| `/history` | List last 20 screened candidates |
| `/re-screen <request_id>` | Re-run research (useful if profile was recently updated) |

### Exit criteria:
✅ Requested action completed
✅ HR manager confirmed receipt (or action completed silently)

---

## STEP 11: DATA LIFECYCLE & BACKGROUND OPERATIONS

```
┌──────────────────────────────────────────────────────────────────┐
│  STEP 11 — DATA LIFECYCLE & BACKGROUND OPERATIONS                │
│  Owner: TinyFish Scheduler  Platform: Background crons            │
│  Duration: Ongoing          Engine: TinyFish Cronjobs             │
│  Trigger: Scheduled (not user-initiated)                          │
└──────────────────────────────────────────────────────────────────┘
```

### What is it?
Background maintenance jobs that keep the system healthy, compliant, and performant.

### Why does it exist?
Candidate data is sensitive (PII). Vietnamese data protection law requires proper retention policies. Caches must stay fresh. The system must self-heal.

### What to do:

| Cronjob | Schedule | Action | Owner |
|---------|----------|--------|-------|
| `data_cleanup` | Daily 3:00 AM | Purge research bundles older than 90 days from PostgreSQL + S3 | TinyFish |
| `linkedin_cache_refresh` | Every 6 hours | Re-fetch cached LinkedIn profiles for candidates still in active pipeline | TinyFish |
| `github_stats_prefetch` | Daily 2:00 AM | Pre-cache GitHub stats for candidates with upcoming interviews | TinyFish |
| `employer_db_update` | Weekly Sunday 1:00 AM | Refresh Vietnamese company registry cache from congthongtin.dkkd.gov.vn | TinyFish |
| `health_check` | Every 5 minutes | Verify: API keys valid, external services reachable, queue depth normal | TinyFish |
| `metrics_rollup` | Hourly | Aggregate: requests/day, avg latency, SLA compliance %, cost per candidate | TinyFish |
| `audit_log_export` | Weekly Monday | Export audit trails for compliance review | TinyFish |

### Monitoring & Alerts:
| Alert Condition | Action |
|----------------|--------|
| SLA breach rate > 10% in 1 hour | Page on-call engineer |
| LinkedIn API returning 403s | Switch to fallback provider, alert team |
| Database connection pool exhausted | Auto-scale, alert team |
| Cost per candidate > $1.00 | Alert finance + engineering |

### Exit criteria:
✅ This step never "exits" — it runs continuously as long as the system is live

---

## Complete Timing Budget

```
┌─────────────────────────────────────────────────────────┐
│  3-MINUTE SLA BREAKDOWN                                   │
│                                                           │
│  Step 1: Trigger .............. 0s    (user action)       │
│  Step 2: Intake ............... 3s    ████                 │
│  Step 3: CV Parsing .......... 15s   ████████████         │
│  Step 4: Dispatch ............. 2s    ██                   │
│  Step 5: Research ........... 120s   (max) ██████████████ │
│  Step 6: Progress ............ ──     (concurrent w/ 5)   │
│  Step 7: LLM Synthesis ....... 25s   ████████████████     │
│  Step 8: Formatting ........... 3s   ███                  │
│  Step 9: Delivery ............. 2s   ██                   │
│                               ─────                       │
│  TOTAL ...................... 170s   (2m 50s target)       │
│  BUFFER ...................... 10s                         │
│  SLA ........................ 180s   (3m 00s hard limit)   │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Who Owns What

| Component | Engine | Role |
|-----------|--------|------|
| Telegram Bot interface | **OpenClaw** | Receives messages, sends responses, manages buttons |
| CV parsing & entity extraction | **OpenClaw** + LLM | Converts documents to structured data |
| Task orchestration & dispatch | **OpenClaw** | Decides which agents to run, manages lifecycle |
| LinkedIn research | **TinyFish** | On-demand agent, API calls to Bright Data/ScrapIn |
| GitHub research | **TinyFish** | On-demand agent, GitHub REST API |
| Portfolio scraping | **TinyFish** | On-demand agent, Playwright headless browser |
| Employer verification | **TinyFish** | On-demand agent, Vietnamese registries + APIs |
| Web search | **TinyFish** | On-demand agent, SerpAPI |
| LLM synthesis | **OpenClaw** + LLM | Cross-referencing, inconsistency detection, brief generation |
| Brief delivery | **OpenClaw** | Formats and sends via Telegram |
| Background maintenance | **TinyFish** | Scheduled crons: cleanup, cache refresh, health checks |
| HR board notifications | **OpenClaw** | Team sharing, alerts, compliance reports |
