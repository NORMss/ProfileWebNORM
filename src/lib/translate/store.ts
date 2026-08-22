import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Lang } from '../i18n';

export type TranslatableEntity = 'post' | 'repo' | 'setting';

export interface CachedTranslation {
  value: string;
  /** false — исходный текст изменился после перевода, нужен новый запрос. */
  fresh: boolean;
  updatedAt: string;
}

export function sourceHash(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

/** Текущий месяц в формате '2026-08' (UTC) — ключ учёта расхода лимита. */
export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function getCached(
  entity: TranslatableEntity,
  entityId: string | number,
  field: string,
  lang: Lang,
  hash: string,
): CachedTranslation | null {
  const row = db
    .select()
    .from(schema.translations)
    .where(
      and(
        eq(schema.translations.entity, entity),
        eq(schema.translations.entityId, String(entityId)),
        eq(schema.translations.field, field),
        eq(schema.translations.lang, lang),
      ),
    )
    .get();
  if (!row) return null;
  return { value: row.value, fresh: row.sourceHash === hash, updatedAt: row.updatedAt };
}

export function putCached(
  entity: TranslatableEntity,
  entityId: string | number,
  field: string,
  lang: Lang,
  hash: string,
  value: string,
  chars: number,
): void {
  const now = new Date().toISOString();
  const existing = db
    .select({ id: schema.translations.id })
    .from(schema.translations)
    .where(
      and(
        eq(schema.translations.entity, entity),
        eq(schema.translations.entityId, String(entityId)),
        eq(schema.translations.field, field),
        eq(schema.translations.lang, lang),
      ),
    )
    .get();

  if (existing) {
    db.update(schema.translations)
      .set({ sourceHash: hash, value, chars, updatedAt: now })
      .where(eq(schema.translations.id, existing.id))
      .run();
    return;
  }
  db.insert(schema.translations)
    .values({
      entity,
      entityId: String(entityId),
      field,
      lang,
      sourceHash: hash,
      value,
      chars,
      updatedAt: now,
    })
    .run();
}

/** Удалить переводы сущности (при удалении поста — чтобы кеш не копился). */
export function dropTranslations(entity: TranslatableEntity, entityId?: string | number): void {
  const where =
    entityId === undefined
      ? eq(schema.translations.entity, entity)
      : and(eq(schema.translations.entity, entity), eq(schema.translations.entityId, String(entityId)));
  db.delete(schema.translations).where(where).run();
}

/** Сколько переводов сущностей уже лежит в кеше — для сводки в админке. */
export function countTranslations(lang: Lang): number {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.translations)
    .where(eq(schema.translations.lang, lang))
    .get();
  return row?.n ?? 0;
}

export interface MonthUsage {
  month: string;
  provider: string;
  chars: number;
  requests: number;
  errors: number;
  updatedAt: string;
}

export function getUsage(month = currentMonth()): MonthUsage {
  const row = db.select().from(schema.translationUsage).where(eq(schema.translationUsage.month, month)).get();
  return {
    month,
    provider: row?.provider ?? '',
    chars: row?.chars ?? 0,
    requests: row?.requests ?? 0,
    errors: row?.errors ?? 0,
    updatedAt: row?.updatedAt ?? '',
  };
}

/** Расход за последние месяцы — маленький график в админке. */
export function getUsageHistory(limit = 6): MonthUsage[] {
  return db
    .select()
    .from(schema.translationUsage)
    .orderBy(sql`month DESC`)
    .limit(limit)
    .all()
    .map((row) => ({
      month: row.month,
      provider: row.provider,
      chars: row.chars,
      requests: row.requests,
      errors: row.errors,
      updatedAt: row.updatedAt,
    }));
}

export function addUsage(provider: string, chars: number, requests: number, errors = 0): void {
  const month = currentMonth();
  const now = new Date().toISOString();
  db.insert(schema.translationUsage)
    .values({ month, provider, chars, requests, errors, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.translationUsage.month,
      set: {
        provider,
        chars: sql`${schema.translationUsage.chars} + ${chars}`,
        requests: sql`${schema.translationUsage.requests} + ${requests}`,
        errors: sql`${schema.translationUsage.errors} + ${errors}`,
        updatedAt: now,
      },
    })
    .run();
}
