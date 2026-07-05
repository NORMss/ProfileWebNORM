import fs from 'node:fs';
import type { APIRoute } from 'astro';
import { getSetting, setSetting } from '../../../lib/settings';
import { IMAGE_MIME, avatarPath } from '../../../lib/uploads';

const MAX_SIZE = 3 * 1024 * 1024; // 3 МБ достаточно для аватара

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
    return Response.json({ ok: false, error: 'Файл больше 3 МБ' }, { status: 400 });
  }

  // Удаляем старый файл с другим расширением, чтобы не копились
  const prev = getSetting('avatar_file');
  const target = avatarPath(ext);
  fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
  if (prev && prev !== target && fs.existsSync(prev)) fs.unlinkSync(prev);

  setSetting('avatar_file', target);
  setSetting('avatar_version', String(Date.now()));
  return Response.json({ ok: true, url: `/media/avatar?v=${getSetting('avatar_version')}` });
};

export const DELETE: APIRoute = async () => {
  const prev = getSetting('avatar_file');
  if (prev && fs.existsSync(prev)) fs.unlinkSync(prev);
  setSetting('avatar_file', '');
  setSetting('avatar_version', String(Date.now()));
  return Response.json({ ok: true });
};
