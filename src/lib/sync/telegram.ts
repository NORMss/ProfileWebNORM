import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { config } from '../config';
import { renderMarkdown } from '../markdown';
import { getSetting, setSetting } from '../settings';

interface TgChat {
  id: number;
  type: string;
  username?: string;
  title?: string;
}

interface TgMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: TgChat;
}

interface TgUpdate {
  update_id: number;
  channel_post?: TgMessage;
}

/**
 * Импорт постов Telegram-канала через Bot API getUpdates.
 * Бот должен быть администратором канала. Offset хранится в settings,
 * поэтому каждый пост импортируется один раз.
 */
export async function syncTelegram(): Promise<{ imported: number }> {
  const token = config.telegramBotToken;
  if (!token) return { imported: 0 };

  const offset = Number.parseInt(getSetting('tg_offset') || '0', 10);
  const params = new URLSearchParams({
    timeout: '0',
    allowed_updates: JSON.stringify(['channel_post']),
  });
  if (offset > 0) params.set('offset', String(offset + 1));

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params}`);
  if (!res.ok) throw new Error(`Telegram getUpdates → ${res.status}`);
  const data = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? 'unknown error'}`);

  const wantChannel = config.telegramChannel.replace(/^@/, '').toLowerCase();
  let imported = 0;
  let maxUpdateId = offset;

  for (const upd of data.result ?? []) {
    maxUpdateId = Math.max(maxUpdateId, upd.update_id);
    const msg = upd.channel_post;
    if (!msg) continue;
    if (wantChannel && (msg.chat.username ?? '').toLowerCase() !== wantChannel) continue;
    const text = (msg.text ?? msg.caption ?? '').trim();
    if (!text) continue;

    const exists = db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.tgMessageId, msg.message_id))
      .get();
    if (exists) continue;

    const lines = text.split('\n');
    const title = (lines[0] ?? '').replace(/[*_`#]+/g, '').trim().slice(0, 120) || 'Пост из Telegram';
    const body = lines.slice(1).join('\n').trim() || text;
    const createdAt = new Date(msg.date * 1000).toISOString();

    db.insert(schema.posts)
      .values({
        title,
        bodyMd: body,
        bodyHtml: renderMarkdown(body),
        source: 'telegram',
        status: 'published',
        tgMessageId: msg.message_id,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    imported++;
  }

  if (maxUpdateId > offset) setSetting('tg_offset', String(maxUpdateId));
  if (imported > 0) {
    setSetting('tg_last_import', JSON.stringify({ at: new Date().toISOString(), count: imported }));
  }
  return { imported };
}
