import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { getSetting } from '../../lib/settings';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Отдаёт загруженный через админку аватар (лежит в data/uploads, вне public/). */
export const GET: APIRoute = async () => {
  const file = getSetting('avatar_file');
  if (!file || !fs.existsSync(file)) {
    return new Response(null, { status: 302, headers: { Location: '/avatar.svg' } });
  }
  const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
  return new Response(fs.readFileSync(file), {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
};
