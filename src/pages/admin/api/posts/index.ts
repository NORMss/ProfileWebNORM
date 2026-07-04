import type { APIRoute } from 'astro';
import { db, schema } from '../../../../lib/db';
import { renderMarkdown } from '../../../../lib/markdown';

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { title?: string; bodyMd?: string; status?: string };
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
      source: 'admin',
      status,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.posts.id })
    .get();
  return Response.json({ ok: true, id: inserted.id });
};
