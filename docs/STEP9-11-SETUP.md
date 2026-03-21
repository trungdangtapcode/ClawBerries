# Step 9 Setup — Google Form → Telegram → Verification Pipeline

This guide covers the 4 things you need to set up for the application intake and delivery flow.

## 1. Telegram env vars

Add these two lines to your `.env` file:

```env
TELEGRAM_BOT_TOKEN=<get this from the team lead>
TELEGRAM_HR_CHAT_ID=<your Telegram user ID>
```

**To get your Telegram user ID:**
Open Telegram, search for `@userinfobot`, send it any message. It replies with your numeric ID.

## 2. Google Form

The Apps Script webhook is already installed on the shared form — **no setup needed**:
https://docs.google.com/forms/d/e/1FAIpQLSel9opz0srrH8Gn2AQc6Lll877jFJqXScrx6dWkjop73zD23g/viewform

Every submission automatically POSTs to the webhook server. You don't need to touch the Script Editor unless the tunnel URL changes (update `WEBHOOK_URL` in `Code.gs`).

**If setting up a new form from scratch:**

1. Create a Google Form with fields: **Full Name**, **Email**, **Position**, **CV/Resume** (file upload, PDF only)
2. Three-dot menu → **Script Editor**
3. Paste the contents of [`docs/google-form-apps-script.js`](./google-form-apps-script.js)
4. Update `WEBHOOK_URL` to your tunnel URL + `/api/applications`
5. Select `installTrigger` from the function dropdown → click **Run**
6. Accept the Google permissions (Advanced → Go to project)
7. Submit a test response to verify

## 3. Cloudflare tunnel

The tunnel exposes your local webhook server to the internet so Google Apps Script can reach it.

```bash
# Install (macOS)
brew install cloudflared

# Start the tunnel
cloudflared tunnel --url http://localhost:3000
```

Copy the generated URL (e.g. `https://xxx.trycloudflare.com`) — this is your `WEBHOOK_URL` for the Apps Script.

> **Note:** This URL changes every time cloudflared restarts. Update the Apps Script if it changes. For production, use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps).

## 4. Install the OpenClaw skill

```bash
pnpm cli install-skill
openclaw gateway restart
```

This copies the ClawBerries skill to `~/.openclaw/skills/clawberries/` so OpenClaw knows how to run verifications when HR clicks buttons in Telegram.

## Running

Start the webhook server:

```bash
pnpm serve
```

This listens on the configured `PORT` (default 3000) for Google Form submissions. When an applicant submits:

1. The CV is downloaded from Google Drive
2. A notification is sent to HR on Telegram with buttons
3. HR clicks **Verify Now** → OpenClaw picks up the callback and runs the pipeline
4. OpenClaw delivers the report back to HR on Telegram

## CLI commands

```bash
pnpm cli run <cv.pdf>         # Run verification on a CV file
pnpm cli status <requestId>   # Check pipeline progress
pnpm cli report <requestId>   # Get the final candidate brief
pnpm cli cancel <requestId>   # Cancel a running pipeline
pnpm cli serve                # Start webhook server
pnpm cli install-skill        # Install OpenClaw skill
```
