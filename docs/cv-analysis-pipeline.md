# CV Analysis Pipeline — Deep Dive

Tài liệu này mô tả chi tiết cách Clawberries phân tích một CV PDF, từ lúc nhận file đến lúc sinh ra báo cáo xác minh ứng viên.

---

## Tổng quan pipeline

```
[Input: PDF]
     │
     ▼
Step 3 ── processPdfWithGemini()        → PdfOcrResult (JSON)
     │
     ▼
Step 4 ── planAndDispatchAgents()       → DispatchPreviewItem[]
     │
     ▼
Step 5 ── runResearch() ─────────────── concurrent TinyFish agents
     │         └── reportProgress()    ← concurrent (Telegram updates)
     ▼
Step 7 ── synthesize()                  → CandidateBrief  [WIP]
     │
     ▼
Step 8 ── formatBrief()                 → Telegram + PDF   [WIP]
```

Steps 3–6 đã hoàn chỉnh. Steps 7–8 hiện là stub TODO.

---

## Step 3 — Parse CV với Gemini

**File:** `src/modules/parser/cv-parser.ts`

### Cơ chế hoạt động

Toàn bộ PDF được đọc thành **base64** và gửi thẳng đến Gemini API dưới dạng `inline_data` — không có pre-processing, không tách text trước.

```
PDF file
  → readPdfAsBase64()
  → POST /v1beta/models/{model}:generateContent?key={apiKey}
      body: { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: base64 } }] }] }
  → parseGeminiJson()
  → PdfOcrResult
```

### Prompt engineering

Prompt yêu cầu Gemini trả về JSON theo schema 8 section cố định:

| Section | Mục đích |
|---|---|
| `identity` | fullName, nameVariants (có/không dấu), email, phone, location |
| `education` | school, degree, field, startDate, endDate, gpa (value + scale) |
| `workHistory` | company, title, startDate, endDate, description — sắp xếp **mới nhất trước** |
| `skills` | name + `evidencedBy`: `github / portfolio / publication / claim_only` |
| `links` | **tất cả** href trong PDF (mailto:, tel:, https://) + type + page number |
| `publications` | title, venue, date, coAuthors[], doi |
| `awards` | title, organization, date, rank |
| `documentMeta` | pageCount, language |

Insight quan trọng ở field `evidencedBy` của skills: Gemini được yêu cầu phân biệt skill nào có bằng chứng thực (GitHub/portfolio/publication) so với chỉ là claim. Điều này feed trực tiếp vào việc agent GitHub sẽ verify những "claim_only" skills.

Insight về `nameVariants`: đặc biệt hữu ích với tên Việt Nam — Gemini được yêu cầu sinh cả dạng có dấu lẫn không dấu, và mọi thứ tự sắp xếp. Dùng sau này để match profile trên LinkedIn.

### Output type

```typescript
type PdfOcrResult = {
  identity: {
    fullName: string
    nameVariants: string[]      // "Nguyen Tien Thang", "Thang Nguyen", "Thắng Nguyễn Tiến"
    email: string | null
    phone: string | null
    location: string | null
  }
  education: EducationEntry[]
  workHistory: WorkEntry[]      // most recent first
  skills: SkillEntry[]          // evidencedBy distinguishes claim vs proven
  links: LinkEntry[]            // ALL hrefs found in PDF
  publications: PublicationEntry[]
  awards: AwardEntry[]
  documentMeta: DocumentMeta
}
```

### Error handling & timeout

- Timeout: **5 phút** (configurable)
- Nếu Gemini block request → throw với `blockReason`
- Response wrap trong markdown code fence (`\`\`\`json ... \`\`\``) → được strip trước khi parse
- Gemini đôi khi trả array `[{...}]` thay vì object → unwrap nếu array

---

## Step 4 — Lên kế hoạch agents

**File:** `src/modules/parser/dispatcher.ts`

### Từ CV sang danh sách agents

`planAgentTargets(ocrResult)` duyệt qua `PdfOcrResult` và tạo một `AgentPlan` cho mỗi target đáng verify:

```
PdfOcrResult
  ├── links (dedupe by type)
  │     ├── linkedin[]   → 1 LinkedIn agent per link
  │     ├── github[]     → 1 GitHub agent per link
  │     └── portfolio[]  → 1 Portfolio agent per link
  ├── workHistory
  │     └── uniqueCompanies (top 5) → 1 Employer agent per company
  ├── identity + recent company → 1 Web Search agent
  ├── publications[]  → 1 Publication agent per entry
  └── awards[]        → 1 Award agent per entry
```

### Agent profiles

Mỗi agent được assign **browser profile** và **timeout**:

| Agent | Profile | Timeout | Lý do |
|---|---|---|---|
| `linkedin` | `stealth` | 45s | Bot detection mạnh |
| `github` | `lite` | 30s | API/HTML đơn giản |
| `portfolio` | `stealth` | 60s | JS rendering, nhiều SPA |
| `employer` | `stealth` | 45s | masothue.com + Google |
| `web_search` | `lite` | 30s | Google SERP |
| `publication` | `lite` | 30s | Scholar/DOI lookup |
| `award` | `lite` | 30s | Issuer website |

- **`stealth`**: Full headless Chrome với anti-detection → chậm hơn nhưng vượt bot protection
- **`lite`**: Plain HTTP fetch hoặc simple render → nhanh hơn

### URL resolution

Mỗi agent type có chiến lược riêng để build URL:

```typescript
// Employer: tìm trên Google
`https://www.google.com/search?q="${companyName}" Vietnam company`

// Publication: tìm trên Google Scholar
`https://scholar.google.com/scholar?q=${title}`

// Award: tìm trang winners
`https://www.google.com/search?q="${title}" ${organization} ${date} winner`

// LinkedIn/GitHub/Portfolio: dùng URL trực tiếp từ CV
plan.params.url
```

### Rate limiting

Rate limit hiện chạy **in-memory** (Redis đã được comment out):

| Agent type | Limit/ngày |
|---|---|
| linkedin | 100 (đắt nhất) |
| github | 4500 |
| portfolio | 500 |
| employer | 1000 |
| web_search | 1000 |
| publication | 1000 |
| award | 1000 |

Khi vượt limit → log warning, skip plan đó. Redis persistence để persist limit qua ngày là intended future work.

### Prompt per agent

Mỗi agent type có `lookFor` (danh sách checks) và `prompt` (natural language instruction) được định nghĩa sẵn. Ví dụ LinkedIn:

```
"Verify name variants, current title/company, past roles and dates,
and education against CV; flag title mismatch, missing employers,
or unexplained date gaps over 3 months."
```

Checks: `current_job_title_and_company`, `employment_dates_vs_cv`, `education_entries_vs_cv`, `profile_name_vs_identity_variants`, `flags:title_mismatch_date_gap_company_missing`

---

## Step 5 — Parallel Research

**File:** `src/modules/research/run-research.ts` + `tinyfish-client.ts`

### Orchestration

```typescript
// 1. INSERT rows
const insertedRows = await db.insert(schema.agentResults)
  .values(items.map(...))
  .returning({ id })

// 2. Init Redis progress
await redis.set(`progress:${requestId}`, JSON.stringify(initialState), "EX", 600)

// 3. Fire all agents concurrently
const runAll = Promise.allSettled(
  items.map((item, idx) => runSingleAgent(requestId, item, idx, rowIds[idx]))
)

// 4. Hard 120s global deadline
await Promise.race([runAll, setTimeout(120_000)])

// 5. Cleanup: agents still "running" → "timeout" in DB
```

Pattern này cho phép:
- Mỗi agent tự quản lý timeout của mình (30–60s) qua `AbortController`
- Có thêm safety net 120s cho toàn bộ batch
- Agent fail/timeout không chặn các agent khác

### TinyFish SSE client

TinyFish dùng **Server-Sent Events** thay vì polling hay webhook:

```
POST /v1/automation/run-sse
  → SSE stream:
      data: {"type": "STARTED", "run_id": "..."}
      data: {"type": "STREAMING_URL", ...}
      data: {"type": "PROGRESS", ...}
      data: {"type": "HEARTBEAT"}
      data: {"type": "COMPLETE", "status": "COMPLETED", "result": {...}}
```

SSE được chọn vì:
- Supports `AbortSignal` → cancel ngay khi timeout
- Realtime progress (dù hiện không dùng PROGRESS events)
- Không cần polling loop

### Progress state trong Redis

```typescript
type ResearchProgressState = {
  total: number
  completed: number
  failed: number
  timedOut: number
  startedAt: number          // epoch ms
  agents: AgentProgressItem[]
}

type AgentProgressItem = {
  agentType: AgentType
  target: string
  status: "running" | "completed" | "failed" | "timeout"
  summary: string | null     // free-text từ TinyFish result
  durationMs: number | null
}
```

Key: `progress:{requestId}`, TTL: 600s (10 phút)

---

## Step 6 — Progress Reporting

**File:** `src/modules/research/progress.ts`

Chạy **concurrent** với Step 5 (qua `Promise.all([runResearch(), reportProgress()])`).

### Throttling logic

```
Poll Redis every 10s
  ├── elapsed < 45s           → skip (likely done before first message)
  ├── NOT (≥50% done OR ≥60s) → skip
  ├── last message < 30s ago  → skip
  └── messages sent ≥ 2       → stop polling
```

Thiết kế này tránh spam Telegram: nếu research xong dưới 45s, user không nhận message nào cho đến kết quả cuối. Nếu lâu hơn, nhận tối đa 2 updates.

---

## Agent reports — Output schema

Mỗi agent trả về typed report, tất cả đều có `summary: string` cho Telegram display:

```typescript
// LinkedIn
type LinkedInReport = {
  profileFound: boolean
  positions: { title, company, startDate, endDate, isCurrent }[]
  education: { school, degree, graduationYear }[]
  endorsementsCount: number
  recommendationsCount: number
  discrepancies: string[]     // so sánh với CV
  summary: string
}

// GitHub
type GitHubReport = {
  username: string | null
  totalRepos: number
  totalStars: number
  commitsLast90Days: number
  topLanguages: string[]
  notableRepos: { name, stars, forks, description }[]
  skillsEvidence: Record<string, boolean>   // claim_only skill → found in repos?
  summary: string
}

// Portfolio
type PortfolioReport = {
  accessible: boolean
  projects: { name, description, techStack, url }[]
  lastUpdatedYear: number | null
  freshnessScore: number       // 0–100
  screenshotUrl: string | null
  summary: string
}

// Employer
type EmployerReport = {
  companyName: string
  verified: boolean
  registrationStatus: string | null
  estimatedHeadcount: string | null
  industry: string | null
  credibilityScore: number     // 0–100
  redFlags: string[]
  summary: string
}

// WebSearch
type WebSearchReport = {
  candidateName: string
  mentions: { source, title, url, snippet }[]
  conferenceCount: number
  awardCount: number
  summary: string
}
```

---

## Database schema

```
research_requests          ← 1 row per PDF submission
  └── candidate_profiles   ← parsed CV data (JSONB heavy)
  └── agent_results        ← 1 row per agent run
  └── candidate_briefs     ← final LLM synthesis output
  └── audit_logs           ← action trail
```

**`research_requests.status` lifecycle:**
```
received → parsing → researching → synthesizing → delivered
                                               ↘ failed
```

**`agent_results.status`:**
```
pending → running → completed
                 ↘ failed
                 ↘ timeout
```

---

## Cấu trúc thư mục

```
src/
├── index.ts                          ← CLI entry point
├── modules/
│   ├── parser/
│   │   ├── cv-parser.ts              ← Gemini PDF → JSON (Step 3)
│   │   ├── dispatcher.ts             ← Agent planning (Step 4)
│   │   └── index.ts
│   ├── research/
│   │   ├── run-research.ts           ← Parallel orchestration (Step 5)
│   │   ├── progress.ts               ← Telegram updates (Step 6)
│   │   ├── tinyfish-client.ts        ← SSE browser agent client
│   │   └── agents/
│   │       ├── linkedin.ts
│   │       ├── github.ts
│   │       ├── portfolio.ts
│   │       ├── employer.ts
│   │       └── web-search.ts
│   ├── synthesis/
│   │   ├── synthesizer.ts            ← LLM cross-reference [WIP]
│   │   └── formatter.ts              ← PDF + Telegram format [WIP]
│   └── delivery/
├── shared/
│   ├── config/env.ts                 ← Zod env validation
│   ├── db/
│   │   ├── index.ts                  ← Drizzle client
│   │   └── schema.ts                 ← PostgreSQL tables
│   ├── redis/index.ts                ← ioredis client
│   └── types/
│       ├── candidate.ts              ← AgentPlan, CandidateBrief
│       └── research.ts               ← Agent reports, progress state
```

---

## Các điểm thiết kế đáng chú ý

**1. Gemini nhận raw PDF thay vì text extraction**
Không dùng pdfparse hay OCR riêng — gửi thẳng base64 PDF cho Gemini. Đơn giản hơn nhiều và Gemini handle multi-page, tables, và layout tốt hơn text extraction naive.

**2. `nameVariants` là first-class citizen**
Tên Việt Nam có nhiều biến thể (có/không dấu, đảo thứ tự). Prompt yêu cầu Gemini sinh tất cả variants → dùng để match trên LinkedIn và cross-reference.

**3. `evidencedBy` trong skills → prioritized verification**
Skills được phân loại ngay từ parse step. Agent GitHub chỉ cần verify các `claim_only` skills — không verify những thứ đã có evidence từ CV.

**4. Employer agent dùng masothue.com**
Thay vì chỉ Google, employer agent được hướng tới cơ sở dữ liệu thuế doanh nghiệp Việt Nam — phù hợp với use case verify công ty Việt.

**5. Redis là ephemeral, PostgreSQL là source of truth**
Nếu Redis down, research vẫn tiếp tục và kết quả vẫn ghi vào DB. Redis chỉ là optimization để Telegram updates không cần poll DB.

**6. 120s hard deadline**
`Promise.race([allAgents, timeout120s])` đảm bảo pipeline không bị block vô hạn. Agents còn "running" sau deadline được mark timeout trong cleanup step.
