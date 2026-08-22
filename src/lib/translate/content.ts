import { excerpt, excerptFromHtml } from '../markdown';
import type { Post, Repo } from '../queries';
import { DEFAULT_LANG, type Lang } from '../i18n';
import { getSetting } from '../settings';
import {
  cachedFields,
  ensureBatch,
  localizeMany,
  translateInBackground,
  type EntityFields,
  type FieldSpec,
  type LocalizeOptions,
} from './index';
import { getCached, sourceHash } from './store';

/** Ключ поля в кеше переводов. */
export const FIELDS = {
  title: 'title',
  excerpt: 'excerpt',
  body: 'body_html',
  description: 'description',
  readme: 'readme_html',
  about: 'about_html',
} as const;

export interface LocalizedPost {
  title: string;
  excerpt: string;
  bodyHtml: string;
  /** Контент реально переведён (а не отдан на языке оригинала). */
  translated: boolean;
}

/** Перевод текущей редакции текста; null — его нет или он устарел. */
function freshValue(entity: 'post' | 'repo' | 'setting', id: string | number, field: string, lang: Lang, source: string) {
  const hit = getCached(entity, id, field, lang, sourceHash(source));
  return hit?.fresh ? hit.value : null;
}

/**
 * Перевод для показа: свежий, а если пост правили и перевод ещё не догнал —
 * перевод предыдущей редакции. Русский текст возвращается только когда
 * перевода нет вовсе. Обновление устаревшего перевода это не отменяет.
 */
function displayValue(
  entity: 'post' | 'repo' | 'setting',
  id: string | number,
  field: string,
  lang: Lang,
  source: string,
): string | null {
  const hit = getCached(entity, id, field, lang, sourceHash(source));
  return hit && hit.value.trim() ? hit.value : null;
}

/**
 * Поля поста для карточки в списке: заголовок и превью.
 * Если тело поста уже переведено, превью берётся из него — лишние символы не тратим.
 */
function postCardFields(post: Post, lang: Lang): FieldSpec[] {
  const fields: FieldSpec[] = [{ field: FIELDS.title, text: post.title }];
  if (!freshValue('post', post.id, FIELDS.body, lang, post.bodyHtml)) {
    fields.push({ field: FIELDS.excerpt, text: excerpt(post.bodyMd) });
  }
  return fields;
}

/** Полный набор полей поста — заголовок, превью и тело. */
export function postFields(post: Post): FieldSpec[] {
  return [
    { field: FIELDS.title, text: post.title },
    { field: FIELDS.excerpt, text: excerpt(post.bodyMd) },
    { field: FIELDS.body, text: post.bodyHtml, html: true },
  ];
}

/** Карточки публикаций (главная и список) — одной пачкой, чтобы не дёргать API по посту. */
export async function localizePostCards(
  posts: Post[],
  lang: Lang,
  options?: LocalizeOptions,
): Promise<Map<number, { title: string; excerpt: string }>> {
  const fallback = () =>
    new Map(posts.map((p) => [p.id, { title: p.title, excerpt: excerpt(p.bodyMd) }]));
  if (lang === DEFAULT_LANG || posts.length === 0) return fallback();

  const items: EntityFields[] = posts.map((post) => ({
    entity: 'post' as const,
    id: post.id,
    fields: postCardFields(post, lang),
  }));
  await localizeMany(items, lang, options);

  return new Map(
    posts.map((post) => {
      const body = displayValue('post', post.id, FIELDS.body, lang, post.bodyHtml);
      const title = displayValue('post', post.id, FIELDS.title, lang, post.title) ?? post.title;
      const preview =
        displayValue('post', post.id, FIELDS.excerpt, lang, excerpt(post.bodyMd)) ??
        (body ? excerptFromHtml(body) : excerpt(post.bodyMd));
      return [post.id, { title, excerpt: preview }];
    }),
  );
}

/** Страница публикации: тело переводится лениво при первом заходе. */
export async function localizePost(post: Post, lang: Lang, options?: LocalizeOptions): Promise<LocalizedPost> {
  const source: LocalizedPost = {
    title: post.title,
    excerpt: excerpt(post.bodyMd),
    bodyHtml: post.bodyHtml,
    translated: lang === DEFAULT_LANG,
  };
  if (lang === DEFAULT_LANG) return source;

  const result = await localizeFieldsFor('post', post.id, postFields(post), lang, options);
  return {
    title: result.values[FIELDS.title] ?? post.title,
    excerpt: result.values[FIELDS.excerpt] ?? source.excerpt,
    bodyHtml: result.values[FIELDS.body] ?? post.bodyHtml,
    translated: result.translated,
  };
}

/** Описания проектов для карточек и списков. */
export async function localizeRepoDescriptions(
  repos: Repo[],
  lang: Lang,
  options?: LocalizeOptions,
): Promise<Map<number, string>> {
  if (lang === DEFAULT_LANG || repos.length === 0) {
    return new Map(repos.map((r) => [r.id, r.description]));
  }
  const items: EntityFields[] = repos
    .filter((r) => r.description.trim())
    .map((repo) => ({
      entity: 'repo' as const,
      id: repo.id,
      fields: [{ field: FIELDS.description, text: repo.description }],
    }));
  await localizeMany(items, lang, options);
  return new Map(
    repos.map((repo) => [
      repo.id,
      displayValue('repo', repo.id, FIELDS.description, lang, repo.description) ?? repo.description,
    ]),
  );
}

export interface LocalizedRepo {
  description: string;
  readmeHtml: string;
  translated: boolean;
}

/** Страница проекта: описание и README (README чаще всего уже английский — тогда лимит не тратится). */
export async function localizeRepo(repo: Repo, lang: Lang, options?: LocalizeOptions): Promise<LocalizedRepo> {
  if (lang === DEFAULT_LANG) {
    return { description: repo.description, readmeHtml: repo.readmeHtml, translated: true };
  }
  const fields: FieldSpec[] = [
    { field: FIELDS.description, text: repo.description },
    { field: FIELDS.readme, text: repo.readmeHtml, html: true },
  ];
  const result = await localizeFieldsFor('repo', repo.id, fields, lang, options);
  return {
    description: result.values[FIELDS.description] ?? repo.description,
    readmeHtml: result.values[FIELDS.readme] ?? repo.readmeHtml,
    translated: result.translated,
  };
}

/** Блок «обо мне» на главной. */
export async function localizeAbout(html: string, lang: Lang, options?: LocalizeOptions): Promise<string> {
  if (lang === DEFAULT_LANG || !html.trim()) return html;
  const result = await localizeFieldsFor(
    'setting',
    'about',
    [{ field: FIELDS.about, text: html, html: true }],
    lang,
    options,
  );
  return result.values[FIELDS.about] ?? html;
}

/** Обёртка над localizeMany для одной сущности (у localizeMany удобный батчинг). */
async function localizeFieldsFor(
  entity: 'post' | 'repo' | 'setting',
  id: string | number,
  fields: FieldSpec[],
  lang: Lang,
  options?: LocalizeOptions,
) {
  const map = await localizeMany([{ entity, id, fields }], lang, options);
  return map.get(`${entity}:${id}`) ?? cachedFields(entity, id, fields, lang);
}

/** Статус перевода поста для админки: none | stale | ready. */
export function postTranslationState(post: Post, lang: Lang = 'en'): 'none' | 'stale' | 'ready' {
  const state = cachedFields('post', post.id, postFields(post), lang);
  if (state.fresh) return 'ready';
  const anyCached = getCached('post', post.id, FIELDS.title, lang, sourceHash(post.title));
  return anyCached ? 'stale' : 'none';
}

/** Сколько символов уйдёт в API, если перевести пост целиком (без уже готовых полей). */
export function postCharCost(post: Post, lang: Lang = 'en'): number {
  return postFields(post)
    .filter((f) => f.text.trim() && freshValue('post', post.id, f.field, lang, f.text) === null)
    .reduce((sum, f) => sum + f.text.length, 0);
}

/** Перевод поста сразу после публикации — в фоне, ответ админке не ждёт API. */
export function translatePostAfterPublish(post: Post): void {
  translateInBackground('post', post.id, postFields(post), 'en');
}

/** Перевод блока «обо мне» после правки в админке. */
export function translateAboutAfterSave(): void {
  const html = getSetting('about_html');
  if (!html.trim()) return;
  translateInBackground('setting', 'about', [{ field: FIELDS.about, text: html, html: true }], 'en');
}

/** Перевод пачки постов после синка Telegram — один проход по API на все новые посты. */
export function translatePostsInBackground(posts: Post[], lang: Lang = 'en'): void {
  if (!posts.length) return;
  ensureBatch(
    posts.map((post) => ({ entity: 'post' as const, id: post.id, fields: postFields(post) })),
    lang,
  )?.catch((e) => {
    console.error('[translate] фоновый перевод постов не удался:', e);
  });
}
