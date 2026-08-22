import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { dropTranslations } from '../../../../lib/translate';

/** Массовое удаление публикаций по списку id. */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isInteger(x)) : [];
  if (ids.length === 0) {
    return Response.json({ ok: false, error: 'Список id пуст' }, { status: 400 });
  }
  const deleted = db.delete(schema.posts).where(inArray(schema.posts.id, ids)).run();
  for (const id of ids) dropTranslations('post', id);
  return Response.json({ ok: true, deleted: deleted.changes });
};
