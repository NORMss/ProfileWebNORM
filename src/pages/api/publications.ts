import type { APIRoute } from 'astro';
import { countPublishedPosts, getPublishedPostCards } from '../../lib/queries';
import { postCardHtml } from '../../lib/cards';
import { formatDate } from '../../lib/format';
import { DEFAULT_LANG, isLang, localePath } from '../../lib/i18n';
import { t } from '../../lib/i18n/dict';
import { localizePostCards } from '../../lib/translate/content';

/** Размер пачки списка публикаций — столько же отдаёт и сама страница. */
export const PUBS_PAGE_SIZE = 8;

/**
 * Следующая пачка карточек публикаций для подгрузки при прокрутке.
 * Отдаёт готовый HTML: разметку рисует тот же шаблон, что и страница,
 * а перевод карточек берётся из кеша (в API за ним не ходим — список
 * не должен ждать сеть).
 */
export const GET: APIRoute = async ({ url }) => {
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(24, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : PUBS_PAGE_SIZE);
  const rawLang = url.searchParams.get('lang') ?? '';
  const lang = isLang(rawLang) ? rawLang : DEFAULT_LANG;

  const total = countPublishedPosts();
  const cards = getPublishedPostCards(limit, offset);
  const localized = await localizePostCards(cards, lang, { allowApi: false });

  const html = cards
    .map((p) =>
      postCardHtml({
        href: localePath(`/publications/${p.id}`, lang),
        title: localized.get(p.id)?.title ?? p.title,
        excerpt: localized.get(p.id)?.excerpt ?? p.excerpt,
        cover: p.coverThumb || p.coverUrl,
        badge: p.source === 'telegram' ? t(lang, 'pubs.badgeTelegram') : t(lang, 'pubs.badgeAdmin'),
        telegram: p.source === 'telegram',
        tgTitle: t(lang, 'pubs.tgSynced'),
        date: formatDate(p.createdAt, lang),
      }),
    )
    .join('');

  return new Response(JSON.stringify({ html, nextOffset: offset + cards.length, hasMore: offset + cards.length < total }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
