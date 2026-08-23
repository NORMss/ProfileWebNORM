import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { uploadsDir } from '../../../lib/uploads';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const CACHE_CONTROL = 'public, max-age=604800, immutable';

/**
 * Отдаёт картинку публикации из data/uploads/posts. Имя строго валидируется —
 * без обхода пути. Чтение асинхронное: на списке публикаций за одну страницу
 * прилетает десяток запросов, а процесс приложения всего один.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const name = params.file ?? '';
  if (!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(name)) {
    return new Response('Not found', { status: 404 });
  }
  const file = path.join(uploadsDir(), 'posts', name);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response('Not found', { status: 404 });

  // ETag: повторный заход отвечает 304 вместо перекачки файла целиком
  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(await fs.readFile(file), { headers });
};
