/**
 * Step 6: Progress Reporting (concurrent with Step 5)
 *
 * Sends real-time progress updates to Telegram while agents run.
 * Polls Redis progress tracker and surfaces critical findings early.
 */
export async function reportProgress(
	_requestId: string,
	_chatId: string,
): Promise<void> {
	// TODO: Poll Redis progress tracker every 10 seconds
	// TODO: Send progress update at ~50% completion (or 60s, whichever first)
	// TODO: Surface critical findings immediately
	// TODO: Throttle: max 2 messages, min 30s between, skip if < 45s total
	throw new Error("Not implemented");
}
