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

interface TgForwardOrigin {
  type: string;
  chat?: TgChat;
  message_id?: number;
  date?: number;
}

interface TgMessage {
  message_id: number;
  date: number;
  edit_date?: number;
  text?: string;
  caption?: string;
  chat: TgChat;
  forward_origin?: TgForwardOrigin;
}

interface TgUpdate {
  update_id: number;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
  /** Личные сообщения боту — используются для импорта пересланных старых постов */
  message?: TgMessage;
}

/**
 * Сообщение из нужного канала? TELEGRAM_CHANNEL может быть @username
 * ИЛИ числовым id (-100…) — приватные каналы username не имеют.
 * Если фильтр не задан, принимаем посты из любого канала, где бот админ.
 */
function matchesChannel(chat: TgChat): boolean {
  const want = config.telegramChannel.trim();
  if (!want) return true;
  const wantNorm = want.replace(/^@/, '').toLowerCase();
  return (chat.username ?? '').toLowerCase() === wantNorm || String(chat.id) === want;
}

function splitTitleBody(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const title = (lines[0] ?? '').replace(/[*_`#]+/g, '').trim().slice(0, 120) || 'Пост из Telegram';
  const body = lines.slice(1).join('\n').trim() || text;
  return { title, body };
}

/**
 * Импорт и синхронизация постов Telegram-канала через Bot API getUpdates.
 * Бот должен быть администратором канала. Offset хранится в settings,
 * поэтому каждый апдейт обрабатывается один раз.
 * Помимо новых постов (channel_post) обрабатываются правки
 * (edited_channel_post): пост, импортированный из Telegram, обновляется
 * и на сайте. Посты, созданные на сайте (source=admin), правками из TG
 * не перезаписываются — для них источник истины сайт.
 */
export async function syncTelegram(): Promise<{ imported: number; updated: number }> {
  const token = config.telegramBotToken;
  if (!token) return { imported: 0, updated: 0 };

  const offset = Number.parseInt(getSetting('tg_offset') || '0', 10);
  const params = new URLSearchParams({
    timeout: '0',
    allowed_updates: JSON.stringify(['channel_post', 'edited_channel_post', 'message']),
  });
  if (offset > 0) params.set('offset', String(offset + 1));

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params}`);
  if (!res.ok) throw new Error(`Telegram getUpdates → ${res.status}`);
  const data = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? 'unknown error'}`);

  let imported = 0;
  let updated = 0;
  let maxUpdateId = offset;

  for (const upd of data.result ?? []) {
    maxUpdateId = Math.max(maxUpdateId, upd.update_id);

    // Новый пост канала → импорт на сайт
    const msg = upd.channel_post;
    if (msg) {
      if (!matchesChannel(msg.chat)) {
        console.log(`[tg] пропущен пост из чата ${msg.chat.id} (@${msg.chat.username ?? '—'}): не совпал TELEGRAM_CHANNEL`);
        continue;
      }
      const text = (msg.text ?? msg.caption ?? '').trim();
      if (!text) continue;

      const exists = db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.tgMessageId, msg.message_id))
        .get();
      if (exists) continue; // в т.ч. посты, отправленные в канал с самого сайта

      const { title, body } = splitTitleBody(text);
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
      continue;
    }

    // Пересланный боту в личку пост канала → импорт СТАРЫХ постов,
    // которые появились до добавления бота (getUpdates их не отдаёт).
    // forward_origin хранит оригинальные канал, message_id и дату.
    const fwd = upd.message;
    if (fwd?.forward_origin) {
      const origin = fwd.forward_origin;
      if (
        origin.type === 'channel' &&
        origin.chat &&
        origin.message_id &&
        matchesChannel(origin.chat) &&
        // если задан чат владельца (для бэкапов) — принимаем пересылки только от него
        (!config.telegramBackupChatId || String(fwd.chat.id) === config.telegramBackupChatId)
      ) {
        const text = (fwd.text ?? fwd.caption ?? '').trim();
        if (!text) continue;
        const exists = db
          .select({ id: schema.posts.id })
          .from(schema.posts)
          .where(eq(schema.posts.tgMessageId, origin.message_id))
          .get();
        if (exists) continue;

        const { title, body } = splitTitleBody(text);
        const createdAt = new Date((origin.date ?? fwd.date) * 1000).toISOString();
        db.insert(schema.posts)
          .values({
            title,
            bodyMd: body,
            bodyHtml: renderMarkdown(body),
            source: 'telegram',
            status: 'published',
            tgMessageId: origin.message_id,
            createdAt,
            updatedAt: createdAt,
          })
          .run();
        imported++;
      }
      continue;
    }

    // Правка поста в канале → обновляем импортированный пост на сайте
    const edited = upd.edited_channel_post;
    if (edited) {
      if (!matchesChannel(edited.chat)) continue;
      const text = (edited.text ?? edited.caption ?? '').trim();
      if (!text) continue;
      const post = db.select().from(schema.posts).where(eq(schema.posts.tgMessageId, edited.message_id)).get();
      // source=admin: сайт — источник истины, правки из TG не затирают пост
      if (!post || post.source !== 'telegram') continue;

      const { title, body } = splitTitleBody(text);
      db.update(schema.posts)
        .set({
          title,
          bodyMd: body,
          bodyHtml: renderMarkdown(body),
          updatedAt: new Date((edited.edit_date ?? edited.date) * 1000).toISOString(),
        })
        .where(eq(schema.posts.id, post.id))
        .run();
      updated++;
    }
  }

  if (maxUpdateId > offset) setSetting('tg_offset', String(maxUpdateId));
  if (imported > 0 || updated > 0) {
    setSetting('tg_last_import', JSON.stringify({ at: new Date().toISOString(), count: imported }));
  }
  return { imported, updated };
}
