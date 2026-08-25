import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { coverFor } from './images';
import { excerpt, renderMarkdown } from './markdown';
import { sourceHash } from './translate/store';

/**
 * Производные поля поста, которые считаются один раз при сохранении:
 * HTML, обложка, текст-превью и хеш тела. Раньше превью рендерилось из
 * markdown на каждый показ списка публикаций (markdown-it + sanitize-html
 * на каждый пост в каждом запросе) — теперь список читает готовую строку.
 */
export function postContentFields(bodyMd: string) {
  const bodyHtml = renderMarkdown(bodyMd);
  return {
    bodyMd,
    bodyHtml,
    excerpt: excerpt(bodyMd),
    bodyHash: sourceHash(bodyHtml),
    ...coverFor(bodyMd),
  };
}

/** Досчитывает excerpt/body_hash постам, сохранённым до появления этих колонок. */
export function backfillPostExcerpts(): number {
  const rows = db
    .select({
      id: schema.posts.id,
      bodyMd: schema.posts.bodyMd,
      bodyHtml: schema.posts.bodyHtml,
      excerpt: schema.posts.excerpt,
      bodyHash: schema.posts.bodyHash,
    })
    .from(schema.posts)
    .all();

  let updated = 0;
  for (const post of rows) {
    const hash = sourceHash(post.bodyHtml);
    // Пустое тело даёт пустое превью — такой пост не пересчитываем каждый старт
    const needsExcerpt = !post.excerpt && post.bodyMd.trim().length > 0;
    if (!needsExcerpt && post.bodyHash === hash) continue;
    db.update(schema.posts)
      .set({ excerpt: needsExcerpt ? excerpt(post.bodyMd) : post.excerpt, bodyHash: hash })
      .where(eq(schema.posts.id, post.id))
      .run();
    updated++;
  }
  if (updated > 0) console.log(`[posts] превью и хеши тел досчитаны: ${updated}`);
  return updated;
}
