import fs from 'node:fs';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { IMAGE_MIME, coverPath } from '../../../lib/uploads';

const MAX_SIZE = 5 * 1024 * 1024;

function getRepo(id: number) {
  return db.select().from(schema.repos).where(eq(schema.repos.id, id)).get();
}

function removeCoverFile(file: string) {
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}

/** Загрузка своей обложки проекта — только в этом случае файл хранится на сервере. */
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const id = Number.parseInt(String(form?.get('id') ?? ''), 10);
  if (!Number.isFinite(id) || !getRepo(id)) {
    return Response.json({ ok: false, error: 'Репозиторий не найден' }, { status: 404 });
  }
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'Файл не передан' }, { status: 400 });
  }
  const ext = IMAGE_MIME[file.type];
  if (!ext) {
    return Response.json({ ok: false, error: 'Поддерживаются PNG, JPEG и WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ ok: false, error: 'Файл больше 5 МБ' }, { status: 400 });
  }

  const prev = getRepo(id)!.coverFile;
  const target = coverPath(id, ext);
  fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
  if (prev && prev !== target) removeCoverFile(prev);

  const imageUrl = `/media/cover/${id}?v=${Date.now()}`;
  db.update(schema.repos).set({ imageUrl, coverFile: target }).where(eq(schema.repos.id, id)).run();
  return Response.json({ ok: true, imageUrl });
};

/**
 * Выбор обложки без загрузки файла: '' — og-image GitHub, либо URL картинки
 * из README этого репозитория. Свой загруженный файл при этом удаляется.
 */
export const PUT: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { id?: number; imageUrl?: string };
  const id = Number(body.id);
  const repo = Number.isFinite(id) ? getRepo(id) : undefined;
  if (!repo) return Response.json({ ok: false, error: 'Репозиторий не найден' }, { status: 404 });

  const imageUrl = (body.imageUrl ?? '').trim();
  if (imageUrl !== '') {
    let allowed: string[] = [];
    try {
      allowed = JSON.parse(repo.readmeImages) as string[];
    } catch {
      allowed = [];
    }
    if (!allowed.includes(imageUrl)) {
      return Response.json({ ok: false, error: 'Можно выбрать только картинку из README' }, { status: 400 });
    }
  }

  removeCoverFile(repo.coverFile);
  db.update(schema.repos).set({ imageUrl, coverFile: '' }).where(eq(schema.repos.id, id)).run();
  return Response.json({ ok: true, imageUrl });
};
