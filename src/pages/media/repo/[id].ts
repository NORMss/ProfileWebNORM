import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { REPO_IMAGE_WIDTHS, normalizeRepoImageSize } from '../../../lib/queries';
import { cachedRemoteWebp, resizedWebp } from '../../../lib/images';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Обложка проекта в том размере, в каком её показывают.
 *
 * Обложкой может быть и загруженный через админку файл, и картинка из README
 * репозитория на чужом хосте. И то и другое — полноразмерные скриншоты: в
 * карточке проекта такой занимает ~500 CSS-px, а в списке обновлений на
 * главной вообще 52. Здесь они приводятся к нужной ширине в WebP и кешируются
 * на диске, поэтому чужой сервер дёргается один раз за картинку, а не на
 * каждый показ страницы. Если sharp недоступен или чужой хост не ответил,
 * отдаём редирект на исходный адрес — карточка остаётся с картинкой.
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const id = Number.parseInt(params.id ?? '', 10);
  const repo = Number.isFinite(id)
    ? db
        .select({ imageUrl: schema.repos.imageUrl, coverFile: schema.repos.coverFile })
        .from(schema.repos)
        .where(eq(schema.repos.id, id))
        .get()
    : undefined;
  if (!repo) return new Response('Not found', { status: 404 });

  const width = REPO_IMAGE_WIDTHS[normalizeRepoImageSize(url.searchParams.get('size'))];

  let file = '';
  if (repo.coverFile) {
    file = (await resizedWebp(repo.coverFile, width)) || repo.coverFile;
  } else if (repo.imageUrl.startsWith('http')) {
    file = await cachedRemoteWebp(repo.imageUrl, String(id), width);
    // Чужой хост не отдал картинку — пусть браузер сходит за ней сам
    if (!file) return new Response(null, { status: 302, headers: { Location: repo.imageUrl } });
  }

  const stat = file ? await fs.stat(file).catch(() => null) : null;
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
