/**
 * Step 9: Delivery
 *
 * Sends the final candidate brief to the HR manager on Telegram.
 * Attaches inline action buttons and logs delivery metrics.
 */
export async function deliverBrief(
	_requestId: string,
	_chatId: string,
	_telegramChunks: string[],
	_pdfUrl: string | null,
): Promise<void> {
	// TODO: Send formatted brief as Telegram message
	// TODO: Attach inline action buttons (Download PDF, Deep Dive, Share, Schedule)
	// TODO: Update request status to 'delivered'
	// TODO: Log delivery metrics (elapsed time, agents completed, cost)
	// TODO: Handle SLA breach (> 3 minutes) — still deliver, append note
	throw new Error("Not implemented");
}
