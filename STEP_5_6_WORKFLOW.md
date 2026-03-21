# Step 5 & 6 — Research Execution & Progress Reporting

> Implementation reference for the parallel research and live progress phases of the Job Applicant Research Agent.

---

## Step 5 — Parallel Research Execution

### What it does

`runResearch(requestId, profile)` orchestrates all research agents concurrently for a given `CandidateProfile`. It writes per-agent results to the `agent_results` table in Postgres and maintains a live Redis progress key throughout execution.

### Entry point

```typescript
// src/modules/research/run-research.ts
export async function runResearch(requestId: string, profile: CandidateProfile): Promise<void>
```

Called after Step 4 task planning. The caller (`src/index.ts`) runs `runResearch` and `reportProgress` concurrently via `Promise.all`.

---

### Agent Plan (built from `CandidateProfile`)

| Condition | Agent | Target | Timeout |
|-----------|-------|--------|---------|
| `links.linkedin` is set | LinkedIn (5A) | LinkedIn profile URL | 45 s |
| `links.github` is set | GitHub (5B) | GitHub profile URL | 30 s |
| `links.portfolio` is set | Portfolio (5C) | Portfolio URL | 60 s |
| `workHistory[]` non-empty | Employer (5D) × N | Company name | 45 s each |
| Always | Web Search (5E) | Candidate full name | 30 s |

> **Max employer agents: 5** (only the 5 most recent `workHistory` entries).
> Web Search is always dispatched regardless of available links.

---

### TinyFish API — SSE Endpoint

All agents call the TinyFish browser automation API using **Server-Sent Events streaming**:

```
POST https://agent.tinyfish.ai/v1/automation/run-sse
X-API-Key: <TINYFISH_API_KEY>
Content-Type: application/json

{
  "url": "<starting URL>",
  "goal": "<natural-language extraction instructions>",
  "browser_profile": "lite" | "stealth"
}
```

**Why SSE over sync (`/v1/automation/run`)?**
Synchronous runs cannot be cancelled. SSE supports `AbortSignal`, which is required for per-agent timeouts.

**Browser profile selection:**
| Agent | Profile | Reason |
|-------|---------|--------|
| LinkedIn | `stealth` | Bot detection, login walls |
| GitHub | `lite` | Plain GitHub REST API JSON |
| Portfolio | `stealth` | JS-rendered SPAs, hosting platform bot detection |
| Employer | `stealth` | masothue.com + LinkedIn Company Pages |
| Web Search | `lite` | Google search results HTML |

**SSE event sequence:**
```
data: {"type":"STARTED","run_id":"run-abc123"}

data: {"type":"PROGRESS","purpose":"Navigating to page"}

data: {"type":"COMPLETE","run_id":"run-abc123","status":"COMPLETED","result":{...}}
```

The client resolves on `COMPLETE`. If `status` is `"FAILED"`, a `TinyFishError` is thrown.

> **Note:** TinyFish may return `status: "COMPLETED"` even for unreachable pages, embedding error details in `result` instead of using `status: "FAILED"`.

---

### Execution Flow

```
runResearch(requestId, profile)
│
├─ buildTasks(profile)         → [AgentTask, ...]
│
├─ db.insert agent_results     → one row per agent, status='running'
│
├─ redis.set progress:{id}     → { total, completed:0, failed:0, timedOut:0,
│                                  startedAt, agents:[...running] }
│
├─ db.update research_requests → status='researching'
│
└─ Promise.race([
     Promise.allSettled([       ← all agents run in parallel
       linkedin(),              ← each has its own AbortController (45s)
       github(),                ← AbortController (30s)
       portfolio(),             ← AbortController (60s)
       employer(Co1),           ← AbortController (45s) x N
       web_search(),            ← AbortController (30s)
     ]),
     globalTimeout(120s)        ← hard deadline, resolves (not rejects)
   ])
│
└─ cleanup: any agent still 'running' in Redis → marked timeout in DB + Redis
```

### Per-agent completion (on success)

```
1. updateAgentDb(rowId, 'completed', result)
   → agent_results: status, result (JSON), completedAt, durationMs

2. updateProgress(requestId, idx, { outcome:'completed', summary, durationMs })
   → Redis: completed+=1, agent.status='completed', agent.summary=<text>
```

### Per-agent failure / timeout

```
AbortError (per-agent timeout) → status='timeout', summary='timed out'
Any other error               → status='failed', summary='failed: <message>'
```

After the global 120 s race fires, any agent still `status='running'` in Redis is force-set to `timeout` in both Postgres and Redis.

---

### Database — `agent_results` table

| Column | Set on insert | Set on completion |
|--------|--------------|-------------------|
| `request_id` | ✓ | — |
| `agent_type` | ✓ | — |
| `agent_target` | ✓ | — |
| `status` | `'running'` | `'completed'` / `'failed'` / `'timeout'` |
| `result` | null | JSON result object |
| `error_message` | null | Error string (on failure) |
| `completed_at` | null | `new Date()` |
| `started_at` | auto (`NOW()`) | — |

---

### Redis — `progress:{requestId}` key (TTL: 600 s)

```typescript
interface ResearchProgressState {
  total: number;          // total agents dispatched
  completed: number;      // agents that returned successfully
  failed: number;         // agents that threw non-abort errors
  timedOut: number;       // agents that hit AbortError or global deadline
  startedAt: number;      // Unix ms — set once at runResearch() call
  agents: AgentProgressItem[];
}

interface AgentProgressItem {
  agentType: AgentType;   // 'linkedin' | 'github' | 'portfolio' | 'employer' | 'web_search'
  target: string;         // URL or company name
  status: 'running' | 'completed' | 'failed' | 'timeout';
  summary: string | null; // Short text from agent result, or error description
  durationMs: number | null;
}
```

---

### Agent result shapes (returned by `callTinyFish`)

Each agent parses the TinyFish `result` object into a typed report using partial defaults:

| Agent | Key fields in result |
|-------|---------------------|
| `LinkedInReport` | `profileFound`, `positions[]`, `education[]`, `endorsementsCount`, `recommendationsCount`, `discrepancies[]`, `summary` |
| `GitHubReport` | `username`, `totalRepos`, `totalStars`, `commitsLast90Days`, `topLanguages[]`, `notableRepos[]`, `skillsEvidence{}`, `summary` |
| `PortfolioReport` | `accessible`, `projects[]`, `lastUpdatedYear`, `freshnessScore`, `screenshotUrl`, `summary` |
| `EmployerReport` | `companyName`, `verified`, `registrationStatus`, `estimatedHeadcount`, `industry`, `credibilityScore`, `redFlags[]`, `summary` |
| `WebSearchReport` | `candidateName`, `mentions[]`, `conferenceCount`, `awardCount`, `summary` |

All fields have safe defaults — a completely empty TinyFish result never causes a crash.

---

## Step 6 — Progress Reporting

### What it does

`reportProgress(requestId, chatId)` runs **concurrently** with `runResearch`, polling Redis every 10 seconds and sending throttled Telegram messages to the HR manager.

### Entry point

```typescript
// src/modules/research/progress.ts
export async function reportProgress(requestId: string, chatId: string): Promise<void>
```

### Throttling rules

| Rule | Value |
|------|-------|
| Poll interval | 10 s |
| Max messages | 2 |
| Min gap between messages | 30 s |
| Skip-all threshold | Research done in < 45 s from `reportProgress` start |

### Flow

```
reportProgress(requestId, chatId)
│
├── [t=0s]  starts, messagesSent=0, lastMessageTime=0
│
├── [t=10s] poll Redis → read ResearchProgressState
│   ├─ key missing → break (key expired or never set)
│   ├─ allDone && elapsed < 45s → break (fast path, no messages)
│   ├─ allDone && elapsed ≥ 45s → break (done, no more polling)
│   └─ percentDone ≥ 50%  → send message (if ≥ 30s since last)
│       └─ messagesSent=1, lastMessageTime=now
│
├── [t=20s] poll Redis
│   └─ percentDone ≥ 50%, timeSinceLastMsg=10s < 30s → skip
│
├── [t=40s] poll Redis
│   └─ percentDone ≥ 50%, timeSinceLastMsg=30s ≥ 30s → send second message
│       └─ messagesSent=2 → exit loop (max reached)
│
└── loop exits when: messagesSent≥2 OR allDone OR key missing
```

> **`lastMessageTime` starts at 0**, so the very first eligible poll always satisfies the 30 s gap requirement.

### Send condition

```typescript
const shouldSend =
  (percentDone >= 0.5 || elapsed >= 60_000) &&
  timeSinceLastMsg >= 30_000
```

- At ≥ 50% done **OR** if 60 s have elapsed without 50%
- AND at least 30 s since the last message

### Telegram message format

```
📊 Progress: 3/5 agents complete

✅ linkedin — 3 positions found
✅ github — 12 repos, 34 stars
✅ employer — credibility 78/100
⏳ portfolio — https://nva.dev…
⏳ web search — Nguyen Van A…
```

Status emojis:
- `✅` completed
- `❌` failed
- `⏱️` timed out
- `⏳` still running

### Telegram API call

```
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": "<chatId>",
  "text": "<progress message>",
  "parse_mode": "HTML"
}
```

If `TELEGRAM_BOT_TOKEN` is not set, `sendTelegramMessage` is a no-op.

---

## Concurrency Model

```typescript
// Called together from the main workflow (src/index.ts):
await Promise.all([
  runResearch(requestId, profile),
  reportProgress(requestId, telegramChatId),
]);
```

Both functions share the same Redis `progress:{requestId}` key as the handshake:
- `runResearch` writes to it on every agent completion
- `reportProgress` reads it on every poll

They are fully decoupled — neither knows about the other.

---

## Error Propagation Summary

| Scenario | `agent_results.status` | Redis `agents[i].status` | Message sent? |
|----------|----------------------|--------------------------|---------------|
| Agent succeeds | `completed` | `completed` | Normal flow |
| Agent times out (AbortError) | `timeout` | `timeout` | If polling catches it |
| Agent throws other error | `failed` | `failed` | If polling catches it |
| Global 120 s deadline | `timeout` | `timeout` | If still `running` post-race |
| TinyFish 401/5xx | `failed` | `failed` | As above |
| TinyFish COMPLETE+FAILED status | `failed` | `failed` | As above |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `TINYFISH_API_KEY` | Optional* | `X-API-Key` for TinyFish. Omit for unauthenticated access. |
| `TELEGRAM_BOT_TOKEN` | Optional* | Bot token for progress messages. If absent, messages silently skipped. |
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_URL` | Yes | Redis connection string |

> *Omitting `TINYFISH_API_KEY` will result in 401 errors from `https://agent.tinyfish.ai`.

---

## File Map

```
src/modules/research/
├── run-research.ts          Step 5 orchestrator
├── progress.ts              Step 6 progress reporter
├── tinyfish-client.ts       TinyFish SSE client (callTinyFish)
└── agents/
    ├── linkedin.ts          5A — LinkedIn profile extraction
    ├── github.ts            5B — GitHub stats extraction
    ├── portfolio.ts         5C — Portfolio scrape
    ├── employer.ts          5D — Vietnamese company registry verification
    └── web-search.ts        5E — General web presence search
```
