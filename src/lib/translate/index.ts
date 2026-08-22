import { getSetting, setSetting } from '../settings';
import { sanitizeRendered } from '../markdown';
import { DEFAULT_LANG, type Lang } from '../i18n';
import {
  TranslateError,
  activeProvider,
  monthlyLimit,
  type TranslateProvider,
} from './providers';
import {
  addUsage,
  currentMonth,
  getCached,
  getUsage,
  putCached,
  sourceHash,
  type TranslatableEntity,
} from './store';

export * from './providers';
export * from './store';

/** Поле сущности, которое переводим: html=true — исходник с разметкой. */
export interface FieldSpec {
  field: string;
  text: string;
  html?: boolean;
}

export interface LastError {
  at: string;
  kind: string;
  message: string;
}

const SETTINGS = {
  autoOnPublish: 'translate_auto_publish',
  lazyOnView: 'translate_lazy',
  lastError: 'translate_last_error',
  lastRun: 'translate_last_run',
} as const;

/** Поля длиннее этого в API не отправляем: один README способен съесть весь месячный лимит. */
const MAX_FIELD_CHARS = 40_000;
/** Ниже этой доли кириллицы считаем текст уже английским и не тратим лимит. */
const CYRILLIC_RATIO = 0.15;

export function autoTranslateOnPublish(): boolean {
  return getSetting(SETTINGS.autoOnPublish) !== '0';
}

export function lazyTranslateOnView(): boolean {
  return getSetting(SETTINGS.lazyOnView) !== '0';
}

export function setTranslateFlag(key: 'autoOnPublish' | 'lazyOnView', value: boolean): void {
  setSetting(SETTINGS[key], value ? '1' : '0');
}

export function getLastError(): LastError | null {
  try {
    const raw = getSetting(SETTINGS.lastError);
    return raw ? (JSON.parse(raw) as LastError) : null;
  } catch {
    return null;
  }
}

export function clearLastError(): void {
  setSetting(SETTINGS.lastError, '');
}

function rememberError(e: unknown): LastError {
  const kind = e instanceof TranslateError ? e.kind : 'api';
  const message = e instanceof Error ? e.message : String(e);
  const entry: LastError = { at: new Date().toISOString(), kind, message: message.slice(0, 400) };
  setSetting(SETTINGS.lastError, JSON.stringify(entry));
  return entry;
}

/** Пауза после ошибки: лимит ждём до следующего месяца, остальное — минуты. */
const BACKOFF_MS: Record<string, number> = {
  auth: 30 * 60_000,
  disabled: 30 * 60_000,
  rate: 5 * 60_000,
  network: 3 * 60_000,
  api: 3 * 60_000,
  too_large: 0,
};

/** Причина, по которой сейчас нельзя обращаться к API; null — можно. */
export function apiBlockReason(): { kind: string; until: string; message: string } | null {
  const last = getLastError();
  if (!last) return null;
  const at = new Date(last.at).getTime();
  if (!Number.isFinite(at)) return null;

  if (last.kind === 'quota') {
    // Лимит бесплатного тарифа сбрасывается с началом нового месяца
    const errMonth = last.at.slice(0, 7);
    if (errMonth === currentMonth()) {
      const next = new Date(`${errMonth}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return { kind: last.kind, until: next.toISOString(), message: last.message };
    }
    return null;
  }

  const backoff = BACKOFF_MS[last.kind] ?? 3 * 60_000;
  if (backoff && Date.now() - at < backoff) {
    return { kind: last.kind, until: new Date(at + backoff).toISOString(), message: last.message };
  }
  return null;
}

/** Остаток месячного лимита символов по локальному счётчику. */
export function remainingChars(provider: TranslateProvider = activeProvider()): number {
  return Math.max(0, monthlyLimit(provider) - getUsage().chars);
}

/** Текст уже на английском (мало кириллицы) — переводить нечего. */
export function looksEnglish(text: string): boolean {
  const letters = text.replace(/<[^>]*>/g, ' ').match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return true;
  const cyrillic = letters.filter((ch) => /\p{Script=Cyrillic}/u.test(ch)).length;
  return cyrillic / letters.length < CYRILLIC_RATIO;
}

/**
 * Режет длинный HTML на куски по границам блоков верхнего уровня,
 * чтобы теги в каждом куске оставались парными.
 */
function splitHtml(html: string, maxChars: number): string[] {
  if (html.length <= maxChars) return [html];
  const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr']);
  const chunks: string[] = [];
  let current = '';
  let depth = 0;
  let cursor = 0;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const end = match.index + match[0].length;
    const name = match[1].toLowerCase();
    const selfClosing = match[2] === '/' || VOID.has(name);
    if (!selfClosing) depth += match[0].startsWith('</') ? -1 : 1;
    if (depth < 0) depth = 0;

    if (depth === 0 && end - cursor > 0) {
      const piece = html.slice(cursor, end);
      if (current && current.length + piece.length > maxChars) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
      cursor = end;
    }
  }
  if (cursor < html.length) current += html.slice(cursor);
  if (current) chunks.push(current);
  return chunks.length ? chunks : [html];
}

interface Unit {
  entity: TranslatableEntity;
  id: string;
  field: string;
  html: boolean;
  text: string;
  hash: string;
}

/** Отбирает поля, которых ещё нет в кеше (или чей исходник изменился). */
function pendingUnits(items: EntityFields[], lang: Lang): Unit[] {
  const units: Unit[] = [];
  for (const item of items) {
    for (const spec of item.fields) {
      if (!spec.text.trim()) continue;
      const hash = sourceHash(spec.text);
      const hit = getCached(item.entity, item.id, spec.field, lang, hash);
      if (hit?.fresh) continue;
      units.push({
        entity: item.entity,
        id: String(item.id),
        field: spec.field,
        html: !!spec.html,
        text: spec.text,
        hash,
      });
    }
  }
  return units;
}

interface Segment {
  unit: Unit;
  index: number;
  text: string;
}

/**
 * Собственно работа с API: пачками, с учётом лимитов запроса у провайдера
 * и остатка месячного лимита. Длинный HTML режется по границам блоков и
 * склеивается обратно. Ошибка прерывает работу, но уже переведённое сохраняется.
 */
async function processUnits(units: Unit[], lang: Lang): Promise<void> {
  const provider = activeProvider();
  if (!provider.configured || units.length === 0) return;
  if (apiBlockReason()) return;

  let budget = remainingChars(provider);
  const queue: Unit[] = [];
  for (const unit of units) {
    // Текст уже на английском (частый случай для README и названий релизов) —
    // сохраняем как есть: ноль символов лимита и никаких запросов.
    if (looksEnglish(unit.text)) {
      putCached(unit.entity, unit.id, unit.field, lang, unit.hash, unit.text, 0);
      continue;
    }
    if (unit.text.length > MAX_FIELD_CHARS) {
      console.warn(
        `[translate] ${unit.entity}#${unit.id}.${unit.field}: ${unit.text.length} символов — пропуск, слишком длинно`,
      );
      continue;
    }
    queue.push(unit);
  }
  if (!queue.length) return;

  const segments: Segment[] = [];
  for (const unit of queue) {
    const parts = unit.html ? splitHtml(unit.text, provider.maxCharsPerRequest) : [unit.text];
    parts.forEach((text, index) => segments.push({ unit, index, text }));
  }

  const partsDone = new Map<Unit, (string | undefined)[]>();
  const partsTotal = new Map<Unit, number>();
  for (const seg of segments) partsTotal.set(seg.unit, (partsTotal.get(seg.unit) ?? 0) + 1);

  /** Все куски поля переведены → пишем результат в кеш. */
  const flushUnit = (unit: Unit) => {
    const done = partsDone.get(unit);
    const total = partsTotal.get(unit) ?? 0;
    if (!done || done.length !== total) return;
    if (done.some((part) => part === undefined)) return;
    const joined = done.join('');
    putCached(unit.entity, unit.id, unit.field, lang, unit.hash, unit.html ? sanitizeRendered(joined) : joined, unit.text.length);
  };

  const sendBatch = async (batch: Segment[], html: boolean): Promise<boolean> => {
    if (!batch.length) return true;
    const chars = batch.reduce((sum, seg) => sum + seg.text.length, 0);
    if (chars > budget) {
      rememberError(new TranslateError('quota', 'Месячный лимит символов исчерпан (локальный счётчик)'));
      return false;
    }
    try {
      const translated = await provider.translate(
        batch.map((seg) => seg.text),
        { from: 'ru', to: 'en', html },
      );
      addUsage(provider.id, chars, 1);
      budget -= chars;
      batch.forEach((seg, i) => {
        const list = partsDone.get(seg.unit) ?? new Array<string | undefined>(partsTotal.get(seg.unit) ?? 1).fill(undefined);
        list[seg.index] = translated[i] ?? seg.text;
        partsDone.set(seg.unit, list);
      });
      for (const unit of new Set(batch.map((seg) => seg.unit))) flushUnit(unit);
      clearLastError();
      return true;
    } catch (e) {
      addUsage(provider.id, 0, 1, 1);
      const err = rememberError(e);
      console.error(`[translate] ${err.kind}: ${err.message}`);
      return false;
    }
  };

  // HTML и обычный текст уходят разными запросами: формат задаётся на весь запрос
  for (const html of [false, true]) {
    const group = segments.filter((seg) => seg.unit.html === html);
    let batch: Segment[] = [];
    let batchChars = 0;
    for (const seg of group) {
      if (batch.length >= provider.maxSegmentsPerRequest || batchChars + seg.text.length > provider.maxCharsPerRequest) {
        if (!(await sendBatch(batch, html))) return;
        batch = [];
        batchChars = 0;
      }
      batch.push(seg);
      batchChars += seg.text.length;
    }
    if (!(await sendBatch(batch, html))) return;
  }

  setSetting(SETTINGS.lastRun, new Date().toISOString());
}

export interface LocalizeOptions {
  /** false — только кеш, без обращения к API (списки, роботы, экономия лимита). */
  allowApi?: boolean;
  /** Сколько ждать API при рендере страницы; после таймаута отдаём русский, перевод дойдёт в кеш. */
  timeoutMs?: number;
}

export interface LocalizeResult {
  /** Поле → текст на нужном языке (или исходник, если перевода ещё нет). */
  values: Record<string, string>;
  /** Всё показано на нужном языке — пусть даже переводом предыдущей редакции текста. */
  translated: boolean;
  /** Перевод соответствует текущей редакции исходника. */
  fresh: boolean;
  /** Часть полей ещё ждёт перевода (текст правили или его вообще не переводили). */
  pending: boolean;
}

export interface EntityFields {
  entity: TranslatableEntity;
  id: string | number;
  fields: FieldSpec[];
}

// Один и тот же пост могут открыть сразу несколько посетителей — второй ждёт
// уже запущенный перевод, а не отправляет в API те же символы ещё раз.
const inFlight = new Map<string, Promise<void>>();

/**
 * Синхронно достаёт из кеша всё, что уже переведено. Ни одного сетевого запроса.
 *
 * allowStale — что показывать, если пост правили и перевод отстал: с ним
 * страница остаётся английской (перевод предыдущей редакции), без него
 * откатывается на русский. Проверка «нужен ли запрос к API» всегда идёт
 * по свежести, поэтому устаревший перевод в любом случае будет обновлён.
 */
export function cachedFields(
  entity: TranslatableEntity,
  id: string | number,
  fields: FieldSpec[],
  lang: Lang,
  allowStale = false,
): LocalizeResult {
  const values: Record<string, string> = {};
  let untranslated = 0;
  let outdated = 0;
  for (const spec of fields) {
    const hit = getCached(entity, id, spec.field, lang, sourceHash(spec.text));
    const empty = !spec.text.trim();
    if (hit?.fresh) {
      values[spec.field] = hit.value;
      continue;
    }
    if (!empty) outdated++;
    if (hit && allowStale && hit.value.trim()) {
      values[spec.field] = hit.value;
      continue;
    }
    values[spec.field] = spec.text;
    if (!empty) untranslated++;
  }
  return {
    values,
    translated: untranslated === 0,
    fresh: outdated === 0,
    pending: outdated > 0,
  };
}

/**
 * Перевод набора сущностей: сначала кеш, недостающее — через API одной очередью.
 * Ошибки наружу не пробрасываются: страница всегда отдаётся, просто на русском.
 */
export function ensureBatch(items: EntityFields[], lang: Lang): Promise<void> | undefined {
  if (lang === DEFAULT_LANG) return undefined;
  const provider = activeProvider();
  if (!provider.configured) return undefined;

  const units = pendingUnits(items, lang);
  if (!units.length) return undefined;

  const key = `${lang}|${units.map((u) => `${u.entity}:${u.id}:${u.field}:${u.hash}`).join(',')}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = processUnits(units, lang)
    .catch((e) => {
      console.error('[translate] непредвиденная ошибка перевода:', e);
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, job);
  return job;
}

/** Перевод полей одной сущности (обёртка над ensureBatch). */
export function ensureFields(
  entity: TranslatableEntity,
  id: string | number,
  fields: FieldSpec[],
  lang: Lang,
): Promise<void> | undefined {
  return ensureBatch([{ entity, id, fields }], lang);
}

/**
 * Локализация полей для рендера страницы: отдаём перевод из кеша, а если его
 * нет — запускаем перевод и ждём не дольше timeoutMs. Не успели — страница
 * уходит на русском, перевод дописывается в кеш и достанется следующему гостю.
 */
export async function localizeMany(
  items: EntityFields[],
  lang: Lang,
  options: LocalizeOptions = {},
): Promise<Map<string, LocalizeResult>> {
  const result = (allowStale: boolean) =>
    new Map(
      items.map((item) => [
        `${item.entity}:${item.id}`,
        cachedFields(item.entity, item.id, item.fields, lang, allowStale),
      ]),
    );

  if (lang === DEFAULT_LANG) return result(false);

  const allowApi = options.allowApi ?? lazyTranslateOnView();
  // Решение «идти ли в API» принимаем по свежести, а не по наличию перевода
  if (!allowApi || [...result(false).values()].every((r) => r.fresh)) return result(true);

  const job = ensureBatch(items, lang);
  if (job) await withTimeout(job, options.timeoutMs ?? 2_500);
  // Не успели перевести правку (или API недоступен) — лучше прошлый английский
  // текст, чем внезапно русский посреди английской версии сайта.
  return result(true);
}

/** Локализация одной сущности. */
export async function localizeFields(
  entity: TranslatableEntity,
  id: string | number,
  fields: FieldSpec[],
  lang: Lang,
  options: LocalizeOptions = {},
): Promise<LocalizeResult> {
  const map = await localizeMany([{ entity, id, fields }], lang, options);
  return map.get(`${entity}:${id}`) ?? cachedFields(entity, id, fields, lang);
}

/** Ждём перевод, но не дольше указанного времени: рендер страницы важнее полноты. */
async function withTimeout(job: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    job.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

/** Перевод в фоне: вызывается после публикации поста, ответ админке не ждёт API. */
export function translateInBackground(
  entity: TranslatableEntity,
  id: string | number,
  fields: FieldSpec[],
  lang: Lang = 'en',
): void {
  ensureFields(entity, id, fields, lang)?.catch((e) => {
    console.error('[translate] фоновый перевод не удался:', e);
  });
}
