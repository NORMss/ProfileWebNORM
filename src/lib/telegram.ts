import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { eq } from 'drizzle-orm';
import { config } from './config';
import { db, schema } from './db';

const md = new MarkdownIt({ html: false, linkify: true });

/** Максимум для sendMessage — 4096 символов; оставляем запас под ссылку «Читать полностью». */
const TG_TEXT_LIMIT = 4096;
const TG_SAFE_LIMIT = 3900;

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgApi<T>(method: string, payload: Record<string, unknown>): Promise<TgResponse<T>> {
  const token = config.telegramBotToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as TgResponse<T>;
}

function channelChatId(): string {
  const channel = config.telegramChannel;
  if (!channel) throw new Error('TELEGRAM_CHANNEL не задан в .env (@username или -100…)');
  return channel.startsWith('@') || channel.startsWith('-') ? channel : `@${channel}`;
}

/** Rich-markdown недоступен (старый Bot API сервер) — надо падать на HTML-режим. */
function isRichUnsupported(r: TgResponse<unknown>): boolean {
  return r.error_code === 404 || /not found|unknown method|rich/i.test(r.description ?? '');
}

/** Относительные ссылки на картинки (/media/…) → абсолютные, чтобы Telegram смог их скачать. */
function absolutizeMedia(markdown: string): string {
  const base = config.siteUrl.replace(/\/$/, '');
  return markdown.replace(/(!?\[[^\]]*\]\()(\/(?:media|_astro)\/)/g, `$1${base}$2`);
}

/** Полный markdown поста для rich-режима: заголовок + тело. */
function postMarkdown(post: { title: string; bodyMd: string }): string {
  return `# ${post.title}\n\n${absolutizeMedia(post.bodyMd)}`.trim();
}

/**
 * Markdown → HTML для СТАРОГО режима (sendMessage parse_mode=HTML) — фолбэк,
 * если Bot API сервер ещё не поддерживает rich-сообщения (до 10.1).
 * Telegram понимает только b/i/u/s/a/code/pre/blockquote: заголовки становятся
 * жирными строками, списки — «• …», картинки — ссылками.
 */
export function mdToTelegramHtml(source: string): string {
  let html = md.render(absolutizeMedia(source));

  html = html
    .replace(/<h[1-6][^>]*>/g, '<b>')
    .replace(/<\/h[1-6]>/g, '</b>\n\n')
    .replace(/<li[^>]*>/g, '• ')
    .replace(/<\/li>/g, '')
    .replace(/<\/?(ul|ol)[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/g, '<a href="$1">🖼 изображение</a>')
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

function htmlMessageText(post: { id: number; title: string; bodyMd: string }): string {
  const title = `<b>${escapeHtml(post.title)}</b>`;
  const body = mdToTelegramHtml(post.bodyMd);
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
  return text;
}

function getPost(postId: number) {
  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) throw new Error('Пост не найден');
  return post;
}

/**
 * Публикация поста в Telegram-канал.
 * Основной путь — rich-сообщения (Bot API 10.1, июнь 2026): sendRichMessage
 * принимает markdown как есть, Telegram сам рендерит заголовки, списки и
 * картинки. Фолбэк для старых серверов — sendMessage с parse_mode=HTML.
 */
export async function sendPostToTelegram(postId: number): Promise<{ messageId: number }> {
  const post = getPost(postId);
  if (post.tgMessageId) throw new Error('Пост уже опубликован в Telegram');
  const chatId = channelChatId();

  let r = await tgApi<{ message_id: number }>('sendRichMessage', {
    chat_id: chatId,
    rich_message: { markdown: postMarkdown(post) },
  });
  if (!r.ok && isRichUnsupported(r)) {
    r = await tgApi<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: htmlMessageText(post),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
  if (!r.ok || !r.result) throw new Error(`Telegram: ${r.description ?? 'неизвестная ошибка'}`);

  db.update(schema.posts)
    .set({ tgMessageId: r.result.message_id, updatedAt: new Date().toISOString() })
    .where(eq(schema.posts.id, postId))
    .run();
  return { messageId: r.result.message_id };
}

/**
 * Обновление уже опубликованного в канале сообщения после редактирования
 * поста на сайте: editMessageText с rich_message (10.1), фолбэк — HTML,
 * затем editMessageCaption (если сообщение было с медиа).
 */
export async function editPostInTelegram(postId: number): Promise<void> {
  const post = getPost(postId);
  if (!post.tgMessageId) throw new Error('Пост ещё не опубликован в Telegram');
  const base = { chat_id: channelChatId(), message_id: post.tgMessageId };

  let r = await tgApi<unknown>('editMessageText', {
    ...base,
    rich_message: { markdown: postMarkdown(post) },
  });
  if (!r.ok && (isRichUnsupported(r) || /rich_message/i.test(r.description ?? ''))) {
    r = await tgApi<unknown>('editMessageText', {
      ...base,
      text: htmlMessageText(post),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
  if (!r.ok && /no text in the message/i.test(r.description ?? '')) {
    r = await tgApi<unknown>('editMessageCaption', {
      ...base,
      caption: htmlMessageText(post).slice(0, 1024),
      parse_mode: 'HTML',
    });
  }
  // «message is not modified» — текст не изменился, это не ошибка
  if (!r.ok && !/message is not modified/i.test(r.description ?? '')) {
    throw new Error(`Telegram: ${r.description ?? 'неизвестная ошибка'}`);
  }
}

export interface TelegramStatus {
  configured: boolean;
  bot?: { username: string; canReadAllGroupMessages?: boolean };
  webhookUrl?: string;
  pendingUpdates?: number;
  lastErrorMessage?: string;
  channel?: string;
  error?: string;
}

/** Диагностика подключения бота — для панели в админке. */
export async function getTelegramStatus(): Promise<TelegramStatus> {
  if (!config.telegramBotToken) return { configured: false, error: 'TELEGRAM_BOT_TOKEN не задан' };
  try {
    const me = await tgApi<{ username: string }>('getMe', {});
    if (!me.ok || !me.result) return { configured: true, error: `getMe: ${me.description}` };
    const wh = await tgApi<{ url: string; pending_update_count: number; last_error_message?: string }>(
      'getWebhookInfo',
      {},
    );
    return {
      configured: true,
      bot: { username: me.result.username },
      webhookUrl: wh.result?.url || '',
      pendingUpdates: wh.result?.pending_update_count ?? 0,
      lastErrorMessage: wh.result?.last_error_message,
      channel: config.telegramChannel || '(не задан)',
    };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Публичное имя канала (без @) — для ссылок t.me. null, если канал приватный (-100…) или не задан. */
export function tgChannelName(): string | null {
  const ch = config.telegramChannel.trim();
  if (!ch || ch.startsWith('-')) return null;
  return ch.replace(/^@/, '');
}

/** Ссылка на конкретный пост канала: https://t.me/<канал>/<message_id>. */
export function tgPostUrl(messageId: number): string | null {
  const name = tgChannelName();
  return name ? `https://t.me/${name}/${messageId}` : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
