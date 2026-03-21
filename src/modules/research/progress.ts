import { config } from "@/shared/config/env.js";
import { redis } from "@/shared/redis/index.js";
import type { ResearchProgressState } from "@/shared/types/research.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // poll Redis every 10 s
const MIN_MSG_GAP_MS = 30_000; // min 30 s between messages
const SKIP_THRESHOLD_MS = 45_000; // skip if research done in < 45 s
const MAX_MESSAGES = 2;

const PROGRESS_KEY = (requestId: string) => `progress:${requestId}`;

// ─── Telegram sender ──────────────────────────────────────────────────────────

async function sendTelegramMessage(
	chatId: string,
	text: string,
): Promise<void> {
	const token = config.TELEGRAM_BOT_TOKEN;
	if (!token) return; // no-op in environments without a bot token

	await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: "HTML",
		}),
	});
}

// ─── Message builder ──────────────────────────────────────────────────────────

function buildProgressMessage(state: ResearchProgressState): string {
	const done = state.completed + state.failed + state.timedOut;
	const lines: string[] = [
		`📊 <b>Progress: ${done}/${state.total} agents complete</b>`,
	];

	for (const agent of state.agents) {
		const label = agent.agentType.replace("_", " ");
		const target =
			agent.target.length > 40 ? `${agent.target.slice(0, 37)}…` : agent.target;

		if (agent.status === "completed") {
			lines.push(`✅ <b>${label}</b> — ${agent.summary ?? target}`);
		} else if (agent.status === "failed") {
			lines.push(`❌ <b>${label}</b> — ${agent.summary ?? "failed"}`);
		} else if (agent.status === "timeout") {
			lines.push(`⏱️ <b>${label}</b> — timed out`);
		} else {
			lines.push(`⏳ <b>${label}</b> — ${target}…`);
		}
	}

	return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Step 6: Progress Reporting (concurrent with Step 5)
 *
 * Polls the Redis progress key every 10 seconds and sends at most
 * 2 progress updates to the HR manager on Telegram.
 *
 * Throttling rules (from USER_JOURNEY_STACK.md §6):
 *  - Max 2 messages total
 *  - Minimum 30 s between messages
 *  - Skip entirely if research completes in < 45 s
 */
export async function reportProgress(
	requestId: string,
	chatId: string,
): Promise<void> {
	const startTime = Date.now();
	let messagesSent = 0;
	let lastMessageTime = 0;

	// Run until all agents are done or the function is abandoned
	// (caller awaits both runResearch and reportProgress concurrently)
	while (messagesSent < MAX_MESSAGES) {
		await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

		const raw = await redis.get(PROGRESS_KEY(requestId));
		if (!raw) break; // key expired or never set

		const state: ResearchProgressState = JSON.parse(raw);
		const elapsed = Date.now() - startTime;
		const done = state.completed + state.failed + state.timedOut;
		const allDone = done >= state.total;

		// If everything finished quickly, skip progress messages entirely
		if (allDone && elapsed < SKIP_THRESHOLD_MS) break;

		// Stop the loop once all agents are done
		if (allDone) break;

		const percentDone = state.total > 0 ? done / state.total : 0;
		const timeSinceLastMsg = Date.now() - lastMessageTime;
		const shouldSend =
			(percentDone >= 0.5 || elapsed >= 60_000) &&
			timeSinceLastMsg >= MIN_MSG_GAP_MS;

		if (shouldSend) {
			const text = buildProgressMessage(state);
			await sendTelegramMessage(chatId, text);
			messagesSent += 1;
			lastMessageTime = Date.now();
		}
	}
}
