import { config } from "@/shared/config/env.js";

const BASE_URL = "https://api.telegram.org";

function botUrl(method: string): string {
	if (!config.TELEGRAM_BOT_TOKEN) {
		throw new Error("TELEGRAM_BOT_TOKEN is not set");
	}
	return `${BASE_URL}/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendMessage(
	chatId: string,
	text: string,
	inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>,
): Promise<{ message_id: number }> {
	const body: Record<string, unknown> = {
		chat_id: chatId,
		text,
		parse_mode: "HTML",
	};
	if (inlineKeyboard) {
		body.reply_markup = { inline_keyboard: inlineKeyboard };
	}

	const res = await fetch(botUrl("sendMessage"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
	if (!data.ok) {
		throw new Error(`Telegram sendMessage failed: ${data.description}`);
	}
	return { message_id: data.result!.message_id };
}

export async function editMessage(
	chatId: string,
	messageId: number,
	text: string,
	inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>,
): Promise<void> {
	const body: Record<string, unknown> = {
		chat_id: chatId,
		message_id: messageId,
		text,
		parse_mode: "HTML",
	};
	if (inlineKeyboard) {
		body.reply_markup = { inline_keyboard: inlineKeyboard };
	}

	await fetch(botUrl("editMessageText"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export async function answerCallbackQuery(
	callbackQueryId: string,
	text?: string,
): Promise<void> {
	await fetch(botUrl("answerCallbackQuery"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
	});
}

export function getHrChatId(): string {
	if (!config.TELEGRAM_HR_CHAT_ID) {
		throw new Error("TELEGRAM_HR_CHAT_ID is not set");
	}
	return config.TELEGRAM_HR_CHAT_ID;
}
