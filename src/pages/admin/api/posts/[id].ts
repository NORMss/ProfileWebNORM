import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { postContentFields } from '../../../../lib/posts';
import { editPostInTelegram } from '../../../../lib/telegram';
import { autoTranslateOnPublish, dropTranslations } from '../../../../lib/translate';
import { translatePostAfterPublish } from '../../../../lib/translate/content';
import { pingIndexNowInBackground } from '../../../../lib/indexnow';

function parseId(raw: string | undefined): number | null {
  const id = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(id) ? id : null;
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  if (id === null) return Response.json({ ok: false, error: 'Неверный id' }, { status: 400 });
  const body = (await request.json()) as { title?: string; bodyMd?: string; status?: string };
  const before = db.select({ status: schema.posts.status }).from(schema.posts).where(eq(schema.posts.id, id)).get();
  const set: Partial<typeof schema.posts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) set.title = body.title.trim();
  if (typeof body.bodyMd === 'string') {
    // HTML, обложка, превью и хеш тела считаются здесь, а не при показе списка
    Object.assign(set, postContentFields(body.bodyMd));
  }
  if (body.status === 'draft' || body.status === 'published') set.status = body.status;
  db.update(schema.posts).set(set).where(eq(schema.posts.id, id)).run();

  // Пост уже есть в Telegram и текст менялся → обновляем сообщение в канале.
  // Ошибка Telegram не отменяет правку на сайте — вернётся предупреждением.
  let telegramError: string | null = null;
  const contentChanged = set.title !== undefined || set.bodyMd !== undefined;
  const post = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();

  // Правка текста делает перевод устаревшим, а черновик мог только что стать
  // публикацией — в обоих случаях догоняем перевод. Если он уже свежий,
  // вызов ничего не сделает и лимит не потратит.
  const published = post?.status === 'published';
  const becamePublished = published && before?.status !== 'published';
  if (post && published && autoTranslateOnPublish()) translatePostAfterPublish(post);
  if (published && (contentChanged || becamePublished)) {
    pingIndexNowInBackground([`/publications/${id}`, '/publications', '/']);
  }
  if (contentChanged && post?.tgMessageId) {
    try {
      await editPostInTelegram(id);
    } catch (e) {
      telegramError = e instanceof Error ? e.message : String(e);
    }
  }
  return Response.json({ ok: true, telegramError });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  if (id === null) return Response.json({ ok: false, error: 'Неверный id' }, { status: 400 });
  db.delete(schema.posts).where(eq(schema.posts.id, id)).run();
  dropTranslations('post', id);
  return Response.json({ ok: true });
};
