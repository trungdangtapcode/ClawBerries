---
name: clawberries
description: "Job applicant research agent. Verify CVs by cross-referencing claims against LinkedIn, GitHub, and the web. Use when HR wants to screen a candidate, check verification status, or retrieve a candidate report."
user-invocable: true
metadata: {"openclaw": {"requires": {"bins": ["pnpm"]}, "os": ["darwin", "linux"]}}
---

# ClawBerries — Job Applicant Research Agent

You are managing an automated CV verification pipeline. When HR sends a CV or asks to verify a candidate, use the ClawBerries CLI.

## Setup

All commands use `pnpm cli` which is an alias defined in the ClawBerries project. The project path is:

```
__CLAWBERRIES_DIR__
```

Run all commands as:

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli <command> [args]
```

## Commands

### 1. Run verification on a CV file

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli run "<path-to-cv.pdf>"
```

Returns `{ requestId }` immediately. The pipeline runs asynchronously in the background.

### 2. Check pipeline status

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli status "<requestId>"
```

Returns JSON with `status` ("parsing", "researching", "synthesizing", "delivered", "failed") and agent progress.

### 3. Get the final report

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli report "<requestId>"
```

Returns the full candidate brief (CV validity score, verified claims, inconsistencies, gaps, interview questions, overall GREEN/YELLOW/RED rating).

### 4. Cancel a running pipeline

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli cancel "<requestId>"
```

Cancels any in-flight TinyFish runs and marks the request as failed.

### 5. Start the webhook server

```bash
pnpm --dir __CLAWBERRIES_DIR__ cli serve
```

Starts the HTTP server for Google Form submissions.

## Handling Telegram callbacks

When HR clicks a button from a ClawBerries notification:

- **`cb_run:<requestId>`** — Start verification. See "Async workflow" below.
- **`cb_skip:<requestId>`** — Reply "Skipped" and do nothing.
- **`cb_viewcv:<requestId>`** — Run `status` command and show the CV file path.
- **`cb_report:<requestId>`** — Run `report` command and present results.

## Async workflow (IMPORTANT)

The verification pipeline takes 3-10 minutes. Do NOT block waiting for it.

When HR clicks "Verify Now" (`cb_run`):

1. Run the `run` command — returns `{ requestId }` immediately
2. Tell HR: "Verification started. I'll check back when it's done. Request ID: [id]"
3. **Do NOT wait.** End the current response. Move on to other tasks.

Later, when HR asks for results or you want to check:
1. Run `status <requestId>` to check if it's done
2. If status is "delivered", run `report <requestId>` and present results
3. If status is "researching" or "synthesizing", tell HR it's still running
4. If status is "failed", tell HR and suggest retrying

## How to present the report to HR

Format clearly:

1. Overall rating emoji (🟢/🟡/🔴) + summary
2. CV validity score (X/100)
3. Key inconsistencies (highest severity first)
4. Must-confirm interview items with specific questions
5. Sources

Keep it concise for Telegram. Summarize top findings and offer to show details.

## Prerequisites

- Docker must be running (Postgres + Redis containers)
- `.env` file must have: GEMINI_API_KEY, TINYFISH_API_KEY, DATABASE_URL, REDIS_URL
- The webhook server must be running for Google Form submissions
