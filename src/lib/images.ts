import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { uploadsDir } from './uploads';

/** Ширина миниатюры: карточка занимает ~150–320 CSS-px, этого хватает и на 2x-экране. */
const THUMB_WIDTH = 640;

export const POSTS_MEDIA = '/media/post/';

function postsDir(): string {
  return path.join(uploadsDir(), 'posts');
}

/**
 * Имя миниатюры рядом с оригиналом: `1699-ab.jpg` → `1699-ab-thumb.webp`.
 * Дефис, а не вторая точка: /media/post/[file] пропускает только `[a-z0-9-]+.ext`.
 */
export function thumbName(file: string): string {
  return `${file.replace(/\.[a-z0-9]+$/i, '')}-thumb.webp`;
}

/**
 * sharp грузим лениво и мягко: если нативного бинарника нет (чужая архитектура,
 * урезанный образ), сайт продолжает работать — карточки просто покажут оригинал.
 */
let sharpModule: Promise<typeof import('sharp') | null> | null = null;
function loadSharp(): Promise<typeof import('sharp') | null> {
  sharpModule ??= import('sharp')
    .then((mod) => {
      // 512 МБ RAM: ресайз в один поток и без кеша libvips
      mod.default.concurrency(1);
      mod.default.cache(false);
      return mod;
    })
    .catch((e) => {
      console.error('[images] sharp недоступен, миниатюры отключены:', e);
      return null;
    });
  return sharpModule;
}

/**
 * Делает WebP-миниатюру картинки публикации. Вызывается один раз — при загрузке
 * из админки или импорте из Telegram, никогда не в момент запроса страницы.
 * Возвращает URL миниатюры или '' (тогда в карточке остаётся оригинал).
 */
export async function makeThumb(file: string): Promise<string> {
  const sharp = await loadSharp();
  if (!sharp) return '';
  const src = path.join(postsDir(), file);
  const out = path.join(postsDir(), thumbName(file));
  try {
    await sharp
      .default(src, { limitInputPixels: 50_000_000 })
      .rotate() // учесть EXIF-поворот: фото с телефона иначе ложится набок
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(out);
    return POSTS_MEDIA + thumbName(file);
  } catch (e) {
    console.error(`[images] не удалось сделать миниатюру для ${file}:`, e);
    return '';
  }
}

/**
 * Уменьшенная WebP-копия загруженного файла рядом с оригиналом.
 *
 * Аватар и обложки проектов админка кладёт как есть — это могут быть PNG на
 * несколько мегабайт, а показываются они в кружке 220 px и в карточке ~500 px.
 * Копия делается один раз (и заново, если оригинал перезалили) и потом только
 * отдаётся с диска, поэтому запрос за картинкой ничего не пересчитывает.
 * Возвращает путь к копии или '' — тогда вызывающий отдаёт оригинал.
 */
const resizing = new Map<string, Promise<string>>();

export async function resizedWebp(source: string, width: number): Promise<string> {
  const out = source.replace(/\.[a-z0-9]+$/i, '') + `-${width}.webp`;
  try {
    const [src, dst] = await Promise.all([
      fs.promises.stat(source),
      fs.promises.stat(out).catch(() => null),
    ]);
    if (dst && dst.mtimeMs >= src.mtimeMs) return out;
  } catch {
    return '';
  }
  // Сразу после загрузки нового файла за копией может прийти несколько
  // запросов одновременно: делаем её один раз, остальные ждут тот же результат.
  const inFlight = resizing.get(out);
  if (inFlight) return inFlight;

  const job = (async () => {
    const sharp = await loadSharp();
    if (!sharp) return '';
    // Пишем во временный файл и переименовываем: rename атомарен, поэтому
    // параллельный запрос читает либо старую копию целиком, либо новую целиком,
    // но никогда недописанную — а отдаём мы её с годовым кешем.
    const tmp = `${out}.${process.pid}.tmp`;
    try {
      await sharp
        .default(source, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(tmp);
      await fs.promises.rename(tmp, out);
      return out;
    } catch (e) {
      console.error(`[images] не удалось уменьшить ${source}:`, e);
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      return '';
    }
  })();

  resizing.set(out, job);
  try {
    return await job;
  } finally {
    resizing.delete(out);
  }
}

/**
 * Первая картинка поста, если она лежит у нас (/media/post/…). Внешние ссылки
 * в обложку не берём: чужой хост может отдать что угодно, отвалиться или
 * посчитать наших читателей, а обложка уходит ещё и в og:image.
 */
export function firstLocalImage(bodyMd: string): string {
  const m = bodyMd.match(/\/media\/post\/[a-z0-9-]+\.(?:png|jpg|webp)/i);
  return m ? m[0] : '';
}

/** Поля обложки поста по его markdown — считаются при сохранении, не при рендере. */
export function coverFor(bodyMd: string): { coverUrl: string; coverThumb: string } {
  const coverUrl = firstLocalImage(bodyMd);
  if (!coverUrl || !fs.existsSync(path.join(postsDir(), path.basename(coverUrl)))) {
    return { coverUrl: '', coverThumb: '' };
  }
  const thumb = thumbName(path.basename(coverUrl));
  return {
    coverUrl,
    coverThumb: fs.existsSync(path.join(postsDir(), thumb)) ? POSTS_MEDIA + thumb : '',
  };
}

/**
 * Обложки для постов, которые появились до этой фичи (и досоздание потерянных
 * миниатюр). Гоняется в фоне при старте: пачка старых постов — это разовый
 * ресайз в один поток, страницы он не задерживает.
 */
export async function backfillPostCovers(): Promise<{ updated: number; thumbs: number }> {
  const rows = db
    .select({
      id: schema.posts.id,
      bodyMd: schema.posts.bodyMd,
      coverUrl: schema.posts.coverUrl,
      coverThumb: schema.posts.coverThumb,
    })
    .from(schema.posts)
    .all();

  let updated = 0;
  let thumbs = 0;
  for (const post of rows) {
    const cover = coverFor(post.bodyMd);
    if (cover.coverUrl && !cover.coverThumb) {
      cover.coverThumb = await makeThumb(path.basename(cover.coverUrl));
      if (cover.coverThumb) thumbs++;
    }
    if (cover.coverUrl === post.coverUrl && cover.coverThumb === post.coverThumb) continue;
    db.update(schema.posts).set(cover).where(eq(schema.posts.id, post.id)).run();
    updated++;
  }
  if (updated > 0) console.log(`[images] обложки: обновлено ${updated}, новых миниатюр ${thumbs}`);
  return { updated, thumbs };
}
