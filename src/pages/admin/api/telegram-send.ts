import type { APIRoute } from 'astro';
import { sendPostToTelegram } from '../../../lib/telegram';

/** Публикация существующего поста сайта в Telegram-канал. */
export const POST: APIRoute = async ({ request }) => {
  const { postId } = (await request.json()) as { postId?: number };
  if (typeof postId !== 'number') {
    return Response.json({ ok: false, error: 'postId обязателен' }, { status: 400 });
  }
  try {
    const { messageId } = await sendPostToTelegram(postId);
    return Response.json({ ok: true, messageId });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
};
