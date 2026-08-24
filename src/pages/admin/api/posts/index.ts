import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { renderMarkdown } from '../../../../lib/markdown';
import { coverFor } from '../../../../lib/images';
import { sendPostToTelegram } from '../../../../lib/telegram';
import { autoTranslateOnPublish } from '../../../../lib/translate';
import { translatePostAfterPublish } from '../../../../lib/translate/content';
import { pingIndexNowInBackground } from '../../../../lib/indexnow';

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as {
    title?: string;
    bodyMd?: string;
    status?: string;
    sendToTelegram?: boolean;
  };
  const title = (body.title ?? '').trim();
  if (!title) return Response.json({ ok: false, error: 'Заголовок обязателен' }, { status: 400 });
  const bodyMd = body.bodyMd ?? '';
  const status = body.status === 'draft' ? 'draft' : 'published';
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.posts)
    .values({
      title,
      bodyMd,
      bodyHtml: renderMarkdown(bodyMd),
      ...coverFor(bodyMd),
      source: 'admin',
      status,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.posts.id })
    .get();

  // Новый пост переводим сразу — так английская версия готова к моменту,
  // когда на неё придёт первый посетитель или робот (лимит тратится один раз).
  if (status === 'published') {
    const post = db.select().from(schema.posts).where(eq(schema.posts.id, inserted.id)).get();
    if (post && autoTranslateOnPublish()) translatePostAfterPublish(post);
    pingIndexNowInBackground([`/publications/${inserted.id}`, '/publications', '/']);
  }

  // Пост на сайте уже создан — ошибка Telegram не отменяет публикацию, а возвращается предупреждением
  let telegramError: string | null = null;
  if (body.sendToTelegram && status === 'published') {
    try {
      await sendPostToTelegram(inserted.id);
    } catch (e) {
      telegramError = e instanceof Error ? e.message : String(e);
    }
  }
  return Response.json({ ok: true, id: inserted.id, telegramError });
};
