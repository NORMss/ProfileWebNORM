import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { getSetting } from '../../lib/settings';
import { resizedWebp } from '../../lib/images';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** CSS показывает аватар максимум в 220 px — 440 хватает и экранам с двойной плотностью. */
const AVATAR_WIDTH = 440;

/**
 * Отдаёт загруженный через админку аватар (лежит в data/uploads, вне public/).
 *
 * Это самая заметная картинка первого экрана, поэтому отдаётся не исходный
 * файл из админки, а его уменьшенная WebP-копия: она делается один раз при
 * первом запросе после загрузки. Если sharp в образе нет, отдаётся оригинал.
 * URL версионирован (?v=…), так что кешировать можно надолго.
 */
export const GET: APIRoute = async ({ request }) => {
  const original = getSetting('avatar_file');
  if (!original) return new Response(null, { status: 302, headers: { Location: '/avatar.svg' } });

  const variant = await resizedWebp(original, AVATAR_WIDTH);
  const file = variant || original;
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response(null, { status: 302, headers: { Location: '/avatar.svg' } });

  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(await fs.readFile(file), { headers });
};
