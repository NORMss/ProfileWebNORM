import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { id?: number; visible?: boolean; category?: string };
  if (typeof body.id !== 'number') {
    return Response.json({ ok: false, error: 'id обязателен' }, { status: 400 });
  }
  const set: Partial<typeof schema.repos.$inferInsert> = {};
  if (typeof body.visible === 'boolean') set.visible = body.visible ? 1 : 0;
  if (body.category === 'hard' || body.category === 'vibe') set.category = body.category;
  if (Object.keys(set).length === 0) {
    return Response.json({ ok: false, error: 'нечего менять' }, { status: 400 });
  }
  db.update(schema.repos).set(set).where(eq(schema.repos.id, body.id)).run();
  return Response.json({ ok: true });
};
