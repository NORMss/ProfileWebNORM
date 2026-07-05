import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { uploadsDir } from '../../../lib/uploads';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Отдаёт картинку публикации из data/uploads/posts. Имя строго валидируется — без обхода пути. */
export const GET: APIRoute = async ({ params }) => {
  const name = params.file ?? '';
  if (!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(name)) {
    return new Response('Not found', { status: 404 });
  }
  const file = path.join(uploadsDir(), 'posts', name);
  if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
};
