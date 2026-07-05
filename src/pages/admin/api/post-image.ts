import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { IMAGE_MIME, uploadsDir } from '../../../lib/uploads';

const MAX_SIZE = 8 * 1024 * 1024;

/** Загрузка картинки для публикации: сохраняем в data/uploads/posts, возвращаем markdown-сниппет. */
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'Файл не передан' }, { status: 400 });
  }
  const ext = IMAGE_MIME[file.type];
  if (!ext) {
    return Response.json({ ok: false, error: 'Поддерживаются PNG, JPEG и WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ ok: false, error: 'Файл больше 8 МБ' }, { status: 400 });
  }

  const dir = path.join(uploadsDir(), 'posts');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  const url = `/media/post/${name}`;
  return Response.json({ ok: true, url, markdown: `![](${url})` });
};
