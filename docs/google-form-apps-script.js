/**
 * Google Apps Script — paste this into the Script Editor of your Google Form.
 *
 * Setup:
 * 1. Create a Google Form with these fields:
 *    - Full Name (Short answer)
 *    - Email (Short answer)
 *    - Position applying for (Short answer or Dropdown)
 *    - CV/Resume (File upload — allow PDF only)
 *
 * 2. Open the form → three-dot menu → Script Editor
 * 3. Paste this entire file, update WEBHOOK_URL below
 * 4. Run → "installTrigger" once (it will ask for permissions — accept)
 * 5. Done — every form submission will POST to your webhook
 *
 * The CV file is uploaded to the form owner's Google Drive.
 * This script makes it publicly readable (via link) so ClawBerries
 * can download it without OAuth. The link expires when you
 * manually revoke sharing or delete the file.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Where to send the webhook POST.
 *
 * For local development with OpenClaw gateway:
 *   Use a tunnel (ngrok, tailscale, cloudflare tunnel) to expose localhost.
 *   Example: "https://your-tunnel.ngrok.io/api/applications"
 *
 * For production:
 *   Your deployed ClawBerries server URL.
 *   Example: "https://clawberries.yourdomain.com/api/applications"
 */
const WEBHOOK_URL = "https://day-spring-done-every.trycloudflare.com/api/applications";

// ─── Trigger installer (run once) ────────────────────────────────────────────

function installTrigger() {
  // Remove old triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger("onFormSubmit")
    .forForm(FormApp.getActiveForm())
    .onFormSubmit()
    .create();

  Logger.log("Trigger installed successfully.");
}

// ─── Form submit handler ─────────────────────────────────────────────────────

function onFormSubmit(e) {
  const response = e.response;
  const items = response.getItemResponses();

  // Extract fields by title (case-insensitive, strip markers like (*))
  const fields = {};
  for (const item of items) {
    const title = item.getItem().getTitle().toLowerCase().replace(/\(\*\)/g, "").trim();
    fields[title] = item.getResponse();
  }

  // Helper: find field by substring match (handles variations like "Full Name", "Họ và tên", etc.)
  function findField(keywords) {
    var titles = Object.keys(fields);
    for (var k = 0; k < keywords.length; k++) {
      for (var t = 0; t < titles.length; t++) {
        if (titles[t].indexOf(keywords[k]) !== -1) return fields[titles[t]];
      }
    }
    return null;
  }

  const fullName = findField(["full name", "name", "họ và tên"]) || "";
  const email = findField(["email"]) || "";
  const position = findField(["position", "vị trí"]) || "";

  // File upload returns an array of Drive file IDs
  const cvFileIds = findField(["cv", "resume", "hồ sơ"]) || [];

  // Process the first uploaded file
  let cvDownloadUrl = null;
  let cvFileName = null;

  if (cvFileIds && cvFileIds.length > 0) {
    try {
      const file = DriveApp.getFileById(cvFileIds[0]);
      cvFileName = file.getName();

      // Make the file accessible via link (anyone with the link can view)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // Direct download URL
      cvDownloadUrl = "https://drive.google.com/uc?export=download&id=" + cvFileIds[0];
    } catch (err) {
      Logger.log("Error accessing CV file: " + err.message);
    }
  }

  // Build the webhook payload
  const payload = {
    source: "google_form",
    submittedAt: new Date().toISOString(),
    applicant: {
      fullName: fullName,
      email: email,
      position: position,
    },
    cv: {
      driveFileId: cvFileIds && cvFileIds.length > 0 ? cvFileIds[0] : null,
      downloadUrl: cvDownloadUrl,
      fileName: cvFileName,
    },
  };

  // POST to ClawBerries webhook
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const result = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Webhook response: " + result.getResponseCode() + " " + result.getContentText());
  } catch (err) {
    Logger.log("Webhook POST failed: " + err.message);
  }
}
