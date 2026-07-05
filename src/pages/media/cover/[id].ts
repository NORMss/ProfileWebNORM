import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Отдаёт загруженную обложку проекта (data/uploads/cover-<id>.*). */
export const GET: APIRoute = async ({ params }) => {
  const id = Number.parseInt(params.id ?? '', 10);
  const repo = Number.isFinite(id)
    ? db.select({ coverFile: schema.repos.coverFile }).from(schema.repos).where(eq(schema.repos.id, id)).get()
    : undefined;
  if (!repo?.coverFile || !fs.existsSync(repo.coverFile)) {
    return new Response('Not found', { status: 404 });
  }
  const type = CONTENT_TYPES[path.extname(repo.coverFile)] ?? 'application/octet-stream';
  return new Response(fs.readFileSync(repo.coverFile), {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
};
