/**
 * Telegram Bot API helpers for U Agent outbound messages.
 * Env: TELEGRAM_BOT_TOKEN. Without it, tools return t.me deep links.
 */

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN?.trim();
}

function botToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t || null;
}

export function telegramDeepLink(opts: {
  username?: string | null;
  phone?: string | null;
  text?: string | null;
}): string {
  const text = opts.text ? `?text=${encodeURIComponent(opts.text)}` : '';
  if (opts.username) {
    const u = opts.username.replace(/^@/, '');
    return `https://t.me/${u}${text}`;
  }
  // Phone deep links are not officially supported; fall back to share URL.
  return `https://t.me/share/url${text ? text.replace('?text=', '?url=&text=') : ''}`;
}

export async function sendTelegramText(opts: {
  chatId: string;
  body: string;
}): Promise<{ ok: boolean; message: string; messageId?: string; deepLink?: string }> {
  const token = botToken();
  if (!token) {
    return {
      ok: true,
      message:
        'Telegram bot not configured (TELEGRAM_BOT_TOKEN). Open the deep link on the user’s device to continue.',
      deepLink: telegramDeepLink({ text: opts.body }),
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.body.slice(0, 4000),
        disable_web_page_preview: false,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: data.description || `Telegram API error (${res.status})`,
        deepLink: telegramDeepLink({ text: opts.body }),
      };
    }
    return {
      ok: true,
      message: 'Telegram message sent.',
      messageId: data.result?.message_id != null ? String(data.result.message_id) : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Telegram send failed',
      deepLink: telegramDeepLink({ text: opts.body }),
    };
  }
}
