# Step 9-11 Setup — Form Intake → Telegram → CV Verification Pipeline

This guide covers how to set up the application intake and delivery flow. There are **two form providers** — pick whichever suits your setup.

## Prerequisites

```bash
# 1. Install dependencies
pnpm install
cd webhook-server && pnpm install && cd ..

# 2. Start Postgres + Redis
docker compose up -d

# 3. Run database migrations
pnpm db:migrate
```

## 1. Environment variables

### Main pipeline (`.env` at project root)

Copy `.env.example` → `.env` and fill in at minimum:

```env
DATABASE_URL=postgres://clawberries:clawberries@localhost:5432/clawberries
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=<your key>
TINYFISH_API_KEY=<your key>
TELEGRAM_BOT_TOKEN=<get from team lead>
TELEGRAM_HR_CHAT_ID=<your Telegram user/group ID>
```

**To get your Telegram chat ID:**
Open Telegram, search for `@userinfobot`, send it any message. It replies with your numeric ID. For a group, add the bot and use `@raw_data_bot`.

### Webhook server (`webhook-server/.env`)

```env
WEBHOOK_PORT=3006
DATABASE_URL=postgres://clawberries:clawberries@localhost:5432/clawberries
STORAGE_DIR=../storage
TELEGRAM_BOT_TOKEN=<same token>
TELEGRAM_CHAT_ID=<group chat ID>
PIPELINE_DIR=..
```

## 2. Form provider (choose one)

### Option A: Tally + ngrok (recommended)

Tally is a free form builder with built-in webhook support — no scripting needed.

**Setup:**

1. Create a Tally form with fields: **Họ và tên**, **Email**, **CV** (file upload)
2. In Tally form settings → **Integrations** → **Webhooks**
3. Add webhook URL: `<your-ngrok-url>/webhook`

**Expose local server:**

```bash
# Install ngrok (https://ngrok.com)
ngrok http 3006
```

Copy the ngrok URL (e.g. `https://xxxx.ngrok-free.app`) → paste into Tally webhook settings.

**Start the webhook server:**

```bash
cd webhook-server
pnpm dev
```

When a candidate submits the form:
1. Tally POSTs the payload to your webhook server
2. The CV PDF is downloaded to `storage/`
3. A preview image (first page) + notification is sent to Telegram
4. Use `/checkcv` or the API to trigger analysis

### Option B: Google Form + Cloudflare tunnel

**Setup:**

1. Create a Google Form with fields: **Full Name**, **Email**, **Position**, **CV/Resume** (file upload, PDF only)
2. Three-dot menu → **Script Editor**
3. Paste the contents of [`docs/google-form-apps-script.js`](./google-form-apps-script.js)
4. Update `WEBHOOK_URL` to your tunnel URL + `/api/applications`
5. Select `installTrigger` from the function dropdown → click **Run**
6. Accept the Google permissions (Advanced → Go to project)
7. Submit a test response to verify

**Expose local server:**

```bash
# Install cloudflared
# macOS: brew install cloudflared
# Linux: see https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup

cloudflared tunnel --url http://localhost:3000
```

Copy the generated URL (e.g. `https://xxx.trycloudflare.com`) → update `WEBHOOK_URL` in the Apps Script.

> **Note:** The URL changes every time cloudflared restarts. For production, use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps).

**Start the main server:**

```bash
clawberries serve
```

## 3. Running CV analysis

```bash
# Direct — run pipeline on a PDF file
pnpm dev <path-to-cv.pdf>

# Via webhook server API (Tally approach)
curl -X POST http://localhost:3006/checkcv \
  -H 'Content-Type: application/json' \
  -d '{"email": "candidate@example.com"}'

# Via CLI (Google Form approach)
pnpm cli run <cv.pdf>
pnpm cli status <requestId>
pnpm cli report <requestId>
pnpm cli cancel <requestId>
```

## 4. OpenClaw integration (optional)

If you use OpenClaw as an AI agent on Telegram:

1. Make sure `openclaw.json` is configured at the project root (see existing config)
2. The `checkcv.sh` script at `webhook-server/scripts/checkcv.sh` provides CLI access
3. Update `~/.openclaw/workspace/TOOLS.md` with the ClawBerries skill instructions

Available `checkcv.sh` commands:

```bash
./webhook-server/scripts/checkcv.sh lookup <email>       # Find CV by email
./webhook-server/scripts/checkcv.sh list [limit]          # List recent submissions
./webhook-server/scripts/checkcv.sh analyze <email>       # Lookup + run pipeline
./webhook-server/scripts/checkcv.sh analyze-path <path>   # Run pipeline on PDF
```

## Pipeline flow

When a candidate submits a CV:

1. **Intake** — Form submission triggers webhook → PDF saved to `storage/` → metadata saved to DB
2. **Notification** — First page preview + candidate info sent to Telegram group
3. **Analysis** (on demand) — Pipeline runs Steps 3→7:
   - Step 3: Parse CV with Gemini Vision
   - Step 4: Plan verification agents
   - Step 5: Parallel research (LinkedIn, GitHub, portfolio, employer, web search)
   - Step 6: Collect results
   - Step 7: LLM synthesis → structured CandidateBrief
4. **Delivery** — Report sent to Telegram with overall rating, inconsistencies, and interview questions
