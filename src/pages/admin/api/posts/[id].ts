import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../lib/db';
import { renderMarkdown } from '../../../../lib/markdown';

function parseId(raw: string | undefined): number | null {
  const id = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(id) ? id : null;
}

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  if (id === null) return Response.json({ ok: false, error: 'Неверный id' }, { status: 400 });
  const body = (await request.json()) as { title?: string; bodyMd?: string; status?: string };
  const set: Partial<typeof schema.posts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) set.title = body.title.trim();
  if (typeof body.bodyMd === 'string') {
    set.bodyMd = body.bodyMd;
    set.bodyHtml = renderMarkdown(body.bodyMd);
  }
  if (body.status === 'draft' || body.status === 'published') set.status = body.status;
  db.update(schema.posts).set(set).where(eq(schema.posts.id, id)).run();
  return Response.json({ ok: true });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  if (id === null) return Response.json({ ok: false, error: 'Неверный id' }, { status: 400 });
  db.delete(schema.posts).where(eq(schema.posts.id, id)).run();
  return Response.json({ ok: true });
};
