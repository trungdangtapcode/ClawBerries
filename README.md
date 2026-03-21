# ClawBerries — Job Applicant Research Agent

Automated candidate research pipeline for HR teams. Given a Telegram message containing a CV, the system researches the applicant across multiple public data sources in parallel and delivers a structured report back via Telegram.

## What it does

1. **Receives a CV** via Telegram (PDF or text)
2. **Parses** candidate profile — name, links, work history, skills
3. **Plans** which research agents to run based on available links
4. **Dispatches agents in parallel** via TinyFish browser automation:
   - LinkedIn profile extraction
   - GitHub stats & skills evidence
   - Portfolio freshness & project analysis
   - Employer verification (Vietnamese business registry)
   - General web presence / mentions search
5. **Reports progress** live to the HR manager via Telegram while agents run
6. **Synthesises** all agent findings into a final report (Step 7 — upcoming)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM, TypeScript) |
| Framework | — (plain async/await) |
| Bot | [grammY](https://grammy.dev) (Telegram bot) |
| Browser automation | [TinyFish](https://agent.tinyfish.ai) (`/v1/automation/run-sse`) |
| LLM | OpenAI API (Step 7, upcoming) |
| Database | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) |
| Cache / pub-sub | Redis via [ioredis](https://github.com/redis/ioredis) |
| Validation | Zod |
| Linter | Biome |
| Tests | Vitest (unit + integration) |

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- Docker (for local Postgres + Redis)

---

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure
docker-compose up -d

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set TELEGRAM_BOT_TOKEN and TINYFISH_API_KEY

# 4. Run database migrations
pnpm db:migrate

# 5. Start dev server
pnpm dev
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `TINYFISH_API_KEY` | Yes | API key for [agent.tinyfish.ai](https://agent.tinyfish.ai) |
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `OPENAI_API_KEY` | Upcoming | Required for Step 7 LLM synthesis |

---

## Scripts

```bash
pnpm dev              # Run in development mode (auto-reload)
pnpm build            # Compile to dist/
pnpm start            # Run compiled output
pnpm test             # Unit tests
pnpm test:integration # Integration tests (requires docker-compose up -d)
pnpm test:all         # Unit + integration
pnpm test:watch       # Watch mode
pnpm typecheck        # TypeScript type check
pnpm check            # Biome lint + format check
pnpm check:fix        # Biome auto-fix
pnpm db:generate      # Generate Drizzle migration files
pnpm db:migrate       # Apply migrations
pnpm db:studio        # Open Drizzle Studio (DB browser)
```

---

## Project structure

```
src/
├── index.ts                         Entry point — Telegram bot listener
├── modules/
│   └── research/
│       ├── run-research.ts          Step 5 — parallel agent orchestrator
│       ├── progress.ts              Step 6 — live Telegram progress reporter
│       ├── tinyfish-client.ts       TinyFish SSE client (callTinyFish)
│       ├── agents/
│       │   ├── linkedin.ts          5A — LinkedIn profile (stealth)
│       │   ├── github.ts            5B — GitHub stats (lite)
│       │   ├── portfolio.ts         5C — Portfolio scrape (stealth)
│       │   ├── employer.ts          5D — Company registry verification (stealth)
│       │   └── web-search.ts        5E — Web mentions search (lite)
│       ├── __tests__/               Unit tests
│       └── __integration__/         Integration tests (real Redis, Postgres, TinyFish)
└── shared/
    ├── config/env.ts                Environment variable schema (Zod)
    ├── db/                          Drizzle ORM setup + schema
    ├── redis/                       Redis singleton
    └── types/                       Shared TypeScript types
```

---

## Architecture — Step 5 & 6

See [`STEP_5_6_WORKFLOW.md`](./STEP_5_6_WORKFLOW.md) for a detailed breakdown of:
- How agent plans are built from a `CandidateProfile`
- TinyFish SSE endpoint usage and browser profile selection
- Redis `progress:{requestId}` state schema
- Progress reporter throttling logic
- Concurrency model and error propagation

---

## Database schema

### `research_requests`
Tracks each research job: `id`, `telegram_chat_id`, `status` (`parsing → researching → done → failed`).

### `agent_results`
One row per agent per job: `agent_type`, `agent_target`, `status` (`running → completed / failed / timeout`), `result` (JSON), `error_message`, `started_at`, `completed_at`.

---

## Testing

Unit tests mock all external dependencies. Integration tests run against real Docker services and the real TinyFish API.

```bash
# Unit tests only (no infrastructure needed)
pnpm test

# Integration tests (requires docker-compose up -d + valid TINYFISH_API_KEY in .env)
pnpm test:integration
```

Integration test coverage:
- TinyFish SSE client against real API (extraction goals, stealth profile, abort signal)
- Progress reporter against real Redis (throttling, message content, fast-path)
- Research orchestrator against real Redis + Postgres (agent lifecycle, DB state, timeouts)

---

## Implementation status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Receive CV via Telegram | ⬜ Planned |
| 2 | Parse CV — extract profile | ⬜ Planned |
| 3 | Build research plan | ⬜ Planned |
| 4 | Dispatch agents via TinyFish | ✅ Done |
| 5 | Parallel research execution | ✅ Done |
| 6 | Live progress reporting | ✅ Done |
| 7 | LLM synthesis & cross-referencing | ⬜ Planned |
| 8 | Deliver final report via Telegram | ⬜ Planned |
