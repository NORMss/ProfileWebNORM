import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { config } from '../config';
import { renderMarkdown } from '../markdown';
import { getSetting, setSetting } from '../settings';
import { uploadsDir } from '../uploads';

interface TgChat {
  id: number;
  type: string;
  username?: string;
  title?: string;
}

interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
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
  photo?: TgPhotoSize[];
  media_group_id?: string;
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
  // Однострочный пост целиком уходит в заголовок — не дублируем его в теле
  const body = lines.slice(1).join('\n').trim();
  return { title, body };
}

/**
 * Скачивает самое большое фото сообщения через getFile в data/uploads/posts
 * и возвращает локальный URL (/media/post/…). null — фото нет или не скачалось.
 */
async function downloadPhoto(token: string, msg: TgMessage): Promise<string | null> {
  const largest = msg.photo?.[msg.photo.length - 1];
  if (!largest) return null;
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(largest.file_id)}`);
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path: string } };
    if (!info.ok || !info.result) return null;

    const rawExt = path.extname(info.result.file_path).slice(1).toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : ['jpg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';

    const bin = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!bin.ok) return null;

    const dir = path.join(uploadsDir(), 'posts');
    fs.mkdirSync(dir, { recursive: true });
    const name = `tg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(await bin.arrayBuffer()));
    return `/media/post/${name}`;
  } catch (e) {
    console.error('[tg] не удалось скачать фото:', e);
    return null;
  }
}

/** Дописывает фото в конец существующего поста (продолжение альбома). */
function appendPhotoToPost(postId: number, photoUrl: string): void {
  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return;
  const bodyMd = `${post.bodyMd}\n\n![](${photoUrl})`.trim();
  db.update(schema.posts)
    .set({ bodyMd, bodyHtml: renderMarkdown(bodyMd) })
    .where(eq(schema.posts.id, postId))
    .run();
}

/** Markdown поста: фото (как в Telegram — сверху) + текст. */
function composeBody(photoUrl: string | null, body: string): string {
  return [photoUrl ? `![](${photoUrl})` : '', body].filter(Boolean).join('\n\n').trim();
}

/**
 * Импорт и синхронизация постов Telegram-канала через Bot API getUpdates.
 * Бот должен быть администратором канала. Offset хранится в settings,
 * поэтому каждый апдейт обрабатывается один раз.
 *
 * Обрабатываются:
 *  - channel_post — новые посты канала (текст + фото, включая альбомы);
 *  - edited_channel_post — правки: пост с source=telegram обновляется
 *    и на сайте (посты source=admin не трогаем — их источник истины сайт);
 *  - message с forward_origin — пересланные боту в личку СТАРЫЕ посты
 *    канала (getUpdates истории не отдаёт): импорт с оригинальными
 *    message_id и датой.
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
  // Альбом приходит серией сообщений с одним media_group_id (подпись только
  // у первого) — запоминаем, в какой пост добавлять остальные фото серии.
  const mediaGroupPost = new Map<string, number>();

  for (const upd of data.result ?? []) {
    maxUpdateId = Math.max(maxUpdateId, upd.update_id);

    // Новый пост канала → импорт на сайт
    const msg = upd.channel_post;
    if (msg) {
      if (!matchesChannel(msg.chat)) {
        console.log(`[tg] пропущен пост из чата ${msg.chat.id} (@${msg.chat.username ?? '—'}): не совпал TELEGRAM_CHANNEL`);
        continue;
      }
      const exists = db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.tgMessageId, msg.message_id))
        .get();
      if (exists) continue; // в т.ч. посты, отправленные в канал с самого сайта

      const text = (msg.text ?? msg.caption ?? '').trim();
      const photoUrl = await downloadPhoto(token, msg);

      // Продолжение альбома: фото без подписи → в пост первого сообщения серии
      if (!text && photoUrl && msg.media_group_id && mediaGroupPost.has(msg.media_group_id)) {
        appendPhotoToPost(mediaGroupPost.get(msg.media_group_id)!, photoUrl);
        continue;
      }
      if (!text && !photoUrl) continue;

      const { title, body } = text ? splitTitleBody(text) : { title: 'Фото из Telegram', body: '' };
      const bodyMd = composeBody(photoUrl, body);
      const createdAt = new Date(msg.date * 1000).toISOString();
      const inserted = db
        .insert(schema.posts)
        .values({
          title,
          bodyMd,
          bodyHtml: renderMarkdown(bodyMd),
          source: 'telegram',
          status: 'published',
          tgMessageId: msg.message_id,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: schema.posts.id })
        .get();
      if (msg.media_group_id) mediaGroupPost.set(msg.media_group_id, inserted.id);
      imported++;
      continue;
    }

    // Пересланный боту в личку пост канала → импорт СТАРЫХ постов,
    // которые появились до добавления бота (getUpdates их не отдаёт).
    // forward_origin хранит оригинальные канал, message_id и дату.
    const fwd = upd.message;
    if (fwd?.forward_origin) {
      const origin = fwd.forward_origin;
      const allowed =
        origin.type === 'channel' &&
        origin.chat &&
        origin.message_id &&
        matchesChannel(origin.chat) &&
        // если задан чат владельца (для бэкапов) — принимаем пересылки только от него
        (!config.telegramBackupChatId || String(fwd.chat.id) === config.telegramBackupChatId);
      if (!allowed) continue;

      const exists = db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.tgMessageId, origin.message_id!))
        .get();
      if (exists) continue;

      const text = (fwd.text ?? fwd.caption ?? '').trim();
      const photoUrl = await downloadPhoto(token, fwd);

      if (!text && photoUrl && fwd.media_group_id && mediaGroupPost.has(fwd.media_group_id)) {
        appendPhotoToPost(mediaGroupPost.get(fwd.media_group_id)!, photoUrl);
        continue;
      }
      if (!text && !photoUrl) continue;

      const { title, body } = text ? splitTitleBody(text) : { title: 'Фото из Telegram', body: '' };
      const bodyMd = composeBody(photoUrl, body);
      const createdAt = new Date((origin.date ?? fwd.date) * 1000).toISOString();
      const inserted = db
        .insert(schema.posts)
        .values({
          title,
          bodyMd,
          bodyHtml: renderMarkdown(bodyMd),
          source: 'telegram',
          status: 'published',
          tgMessageId: origin.message_id!,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: schema.posts.id })
        .get();
      if (fwd.media_group_id) mediaGroupPost.set(fwd.media_group_id, inserted.id);
      imported++;
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
      // Уже скачанные фото поста сохраняем: текст меняем, ![](…) оставляем
      const oldPhotos = [...post.bodyMd.matchAll(/!\[[^\]]*\]\(\/media\/post\/[^)]+\)/g)].map((m) => m[0]);
      const bodyMd = [oldPhotos.join('\n\n'), body].filter(Boolean).join('\n\n').trim();
      db.update(schema.posts)
        .set({
          title,
          bodyMd,
          bodyHtml: renderMarkdown(bodyMd),
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
