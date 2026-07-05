import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';
import { syncTelegram } from '../../../lib/sync/telegram';

export const POST: APIRoute = async () => {
  if (!config.telegramBotToken) {
    return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан в .env' }, { status: 400 });
  }
  try {
    const { imported, updated } = await syncTelegram();
    return Response.json({ ok: true, imported, updated });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
};
