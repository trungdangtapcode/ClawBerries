---
name: clawberries
description: "Job applicant research agent. Verify CVs by cross-referencing claims against LinkedIn, GitHub, and the web. Use when HR wants to screen a candidate, check verification status, or retrieve a candidate report."
user-invocable: true
metadata: {"openclaw": {"requires": {"bins": ["pnpm"]}, "os": ["darwin", "linux"]}}
---

# ClawBerries — Job Applicant Research Agent

You are managing an automated CV verification pipeline. When HR sends a CV or asks to verify a candidate, use the ClawBerries CLI to run the pipeline.

## Setup

The ClawBerries project is at `/Users/PhatNguyen/Desktop/ClawBerries`.
All commands must be run from that directory with env vars loaded:

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a
```

## Commands

### 1. Run verification on a CV file

When HR shares a CV file or asks you to verify a candidate:

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a && pnpm tsx src/cli.ts run "<path-to-cv.pdf>"
```

This returns a JSON object with `requestId`. Save this ID — you'll need it to check status and retrieve the report.

The pipeline runs asynchronously (Steps 3→7):
- Step 3: Parse CV with Gemini Vision
- Step 4: Plan verification agents
- Step 5: Run parallel research (LinkedIn, GitHub, portfolio, employer, web search)
- Step 6: Progress reporting
- Step 7: LLM synthesis with structured output

### 2. Check pipeline status

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a && pnpm tsx src/cli.ts status "<requestId>"
```

Returns JSON with `status` ("parsing", "researching", "synthesizing", "delivered", "failed") and agent progress.

### 3. Get the final report

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a && pnpm tsx src/cli.ts report "<requestId>"
```

Returns the full candidate brief with:
- **CV Validity Score** (0-100)
- **Verified claims** with evidence
- **Inconsistencies** rated by severity
- **Gaps** (employment, skill, education)
- **Interview must-confirm items** with specific questions for HR
- **Overall rating**: GREEN / YELLOW / RED

### 4. Cancel a running pipeline

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a && pnpm tsx src/cli.ts cancel "<requestId>"
```

### 5. Start the webhook server

```bash
cd /Users/PhatNguyen/Desktop/ClawBerries && set -a && source .env && set +a && pnpm tsx src/cli.ts serve
```

Starts the HTTP server on the configured PORT that receives Google Form submissions at `POST /api/applications`.

## Handling Telegram callbacks

When HR clicks a button from a ClawBerries notification:

- **`cb_run:<requestId>`** — Start verification. See "Async workflow" below.
- **`cb_skip:<requestId>`** — Reply "Skipped" and do nothing.
- **`cb_viewcv:<requestId>`** — Run `status` command and show the CV file path.
- **`cb_report:<requestId>`** — Run `report` command and present results.

## Async workflow (IMPORTANT)

The verification pipeline takes 3-10 minutes. Do NOT block waiting for it.

When HR clicks "Verify Now" (`cb_run`):

1. Run `clawberries run <cv-path>` — this returns `{ requestId }` immediately
2. Tell HR: "Verification started for [name]. I'll notify you when it's done. Request ID: [id]"
3. **Do NOT wait.** End the current response. Move on to other tasks.

Later, when HR asks for results or you want to check:
1. Run `clawberries status <requestId>` to check if it's done
2. If status is "delivered", run `clawberries report <requestId>` and present results
3. If status is "researching" or "synthesizing", tell HR it's still running
4. If status is "failed", tell HR and suggest retrying

HR can also proactively ask: "What's the status of [requestId]?" or "Show me the report for [name]"

## How to present the report to HR

When delivering results, format clearly:

1. Overall rating emoji (🟢/🟡/🔴) + summary
2. CV validity score (X/100)
3. Key inconsistencies (highest severity first)
4. Must-confirm interview items with specific questions
5. Sources

Keep it concise for Telegram. If too long, summarize the top findings and offer to show the full details.

## Prerequisites

- Docker must be running (Postgres + Redis containers)
- `.env` file must have: GEMINI_API_KEY, TINYFISH_API_KEY, DATABASE_URL, REDIS_URL
- The webhook server must be running for Google Form submissions
