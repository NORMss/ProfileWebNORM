import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { resizedWebp } from '../../../lib/images';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Карточка проекта в сетке — ~500 CSS-px; 1000 закрывает и плотные экраны. */
const COVER_WIDTH = 1000;

/**
 * Отдаёт загруженную обложку проекта (data/uploads/cover-<id>.*) уменьшенной
 * WebP-копией: в сетке проектов таких картинок сразу несколько, и исходные
 * скриншоты из админки весят на порядок больше, чем нужно карточке.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const id = Number.parseInt(params.id ?? '', 10);
  const repo = Number.isFinite(id)
    ? db.select({ coverFile: schema.repos.coverFile }).from(schema.repos).where(eq(schema.repos.id, id)).get()
    : undefined;
  if (!repo?.coverFile) return new Response('Not found', { status: 404 });

  const variant = await resizedWebp(repo.coverFile, COVER_WIDTH);
  const file = variant || repo.coverFile;
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response('Not found', { status: 404 });

  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400',
    ETag: etag,
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(await fs.readFile(file), { headers });
};
