import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { eq } from 'drizzle-orm';
import { config } from './config';
import { db, schema } from './db';

const md = new MarkdownIt({ html: false, linkify: true });

/** Максимум для sendMessage — 4096 символов; оставляем запас под ссылку «Читать полностью». */
const TG_TEXT_LIMIT = 4096;
const TG_SAFE_LIMIT = 3900;

/**
 * Markdown → HTML, который понимает Telegram Bot API (parse_mode=HTML).
 * Telegram поддерживает только b/i/u/s/a/code/pre/blockquote и не понимает
 * блочные теги — заголовки становятся жирными строками, списки — «• …».
 */
export function mdToTelegramHtml(source: string): string {
  let html = md.render(source);

  // Блочная структура → переводы строк (до sanitize, иначе текст склеится)
  html = html
    .replace(/<h[1-6][^>]*>/g, '<b>')
    .replace(/<\/h[1-6]>/g, '</b>\n\n')
    .replace(/<li[^>]*>/g, '• ')
    .replace(/<\/li>/g, '')
    .replace(/<\/?(ul|ol)[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<img[^>]*>/g, '')
    .replace(/<hr[^>]*\/?>/g, '—\n\n');

  html = sanitizeHtml(html, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote'],
    allowedAttributes: { a: ['href'] },
    disallowedTagsMode: 'discard',
  });

  return html
    .replace(/<blockquote>\s+/g, '<blockquote>')
    .replace(/\s+<\/blockquote>/g, '</blockquote>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface TgSendResult {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

/**
 * Публикация поста в Telegram-канал (TELEGRAM_CHANNEL) от имени бота.
 * Возвращает message_id — он сохраняется в пост, чтобы импорт канала
 * не создал дубликат. Если текст длиннее лимита — обрезаем и ставим
 * ссылку «Читать полностью» на сайт.
 */
export async function sendPostToTelegram(postId: number): Promise<{ messageId: number }> {
  const token = config.telegramBotToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env');
  const channel = config.telegramChannel;
  if (!channel) throw new Error('TELEGRAM_CHANNEL не задан в .env (например, @normno)');

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) throw new Error('Пост не найден');
  if (post.tgMessageId) throw new Error('Пост уже опубликован в Telegram');

  const title = `<b>${escapeHtml(post.title)}</b>`;
  let body = mdToTelegramHtml(post.bodyMd);
  const postUrl = `${config.siteUrl.replace(/\/$/, '')}/publications/${post.id}`;

  let text = `${title}\n\n${body}`;
  if (text.length > TG_SAFE_LIMIT) {
    // При переполнении шлём простой текст (без разметки) — его можно резать безопасно,
    // не рискуя разорвать HTML-тег посередине.
    const plain = escapeHtml(
      sanitizeHtml(md.render(post.bodyMd), { allowedTags: [], allowedAttributes: {} }).replace(/\n{3,}/g, '\n\n'),
    ).trim();
    const budget = TG_SAFE_LIMIT - title.length - 80;
    let cut = plain.slice(0, budget);
    cut = cut.slice(0, Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '))) + '…';
    text = `${title}\n\n${cut}\n\n<a href="${postUrl}">Читать полностью →</a>`;
  }
  if (text.length > TG_TEXT_LIMIT) text = text.slice(0, TG_TEXT_LIMIT);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channel.startsWith('@') || channel.startsWith('-') ? channel : `@${channel}`,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TgSendResult;
  if (!data.ok || !data.result) {
    throw new Error(`Telegram: ${data.description ?? `HTTP ${res.status}`}`);
  }

  db.update(schema.posts)
    .set({ tgMessageId: data.result.message_id, updatedAt: new Date().toISOString() })
    .where(eq(schema.posts.id, postId))
    .run();
  return { messageId: data.result.message_id };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
