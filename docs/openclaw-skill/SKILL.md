---
name: clawberries
description: "Job applicant research agent. Verify CVs by cross-referencing claims against LinkedIn, GitHub, and the web. Use when HR wants to screen a candidate, check verification status, or retrieve a candidate report."
user-invocable: true
metadata: {"openclaw": {"requires": {"bins": ["pnpm"]}, "os": ["darwin", "linux"]}}
---

# ClawBerries — Job Applicant Research Agent

You are managing an automated CV verification pipeline. When HR sends a CV or asks to verify a candidate, use the ClawBerries tools to run the pipeline.

## Setup

The ClawBerries project directory is defined by the `CLAWBERRIES_DIR` environment variable (defaults to the project root where `package.json` lives).

All commands must be run from that directory with env vars loaded:

```bash
cd "/mnt/mmlab2024nas/vund/.svn/envs/lotus" && set -a && source .env && set +a
```

## Commands

### 1. Run verification on a CV file

When HR shares a CV file or asks you to verify a candidate:

```bash
cd "/mnt/mmlab2024nas/vund/.svn/envs/lotus" && set -a && source .env && set +a && pnpm dev "<path-to-cv.pdf>"
```

The pipeline runs synchronously through Steps 3→7:
- Step 3: Parse CV with Gemini Vision
- Step 4: Plan verification agents
- Step 5: Run parallel research (LinkedIn, GitHub, portfolio, employer, web search)
- Step 6: Collect results
- Step 7: LLM synthesis with structured output

### 2. Look up a candidate by email

```bash
"/mnt/mmlab2024nas/vund/.svn/envs/lotus/webhook-server/scripts/checkcv.sh" lookup "<email>"
```

Returns name, file path, and submission date from the database.

### 3. Analyze a candidate by email

```bash
"/mnt/mmlab2024nas/vund/.svn/envs/lotus/webhook-server/scripts/checkcv.sh" analyze "<email>"
```

Looks up the CV in the database and runs the full pipeline.

### 4. List recent submissions

```bash
"/mnt/mmlab2024nas/vund/.svn/envs/lotus/webhook-server/scripts/checkcv.sh" list [limit]
```

Shows recent CV submissions (default 10).

### 5. CLI commands (alternative)

```bash
cd "/mnt/mmlab2024nas/vund/.svn/envs/lotus" && set -a && source .env && set +a
pnpm cli run "<cv.pdf>"            # Run verification
pnpm cli status "<requestId>"      # Check pipeline progress
pnpm cli report "<requestId>"      # Get the final candidate brief
pnpm cli cancel "<requestId>"      # Cancel a running pipeline
```

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
- `.env` file must have: `GEMINI_API_KEY`, `TINYFISH_API_KEY`, `DATABASE_URL`, `REDIS_URL`
- `CLAWBERRIES_DIR` env var should point to the project root
