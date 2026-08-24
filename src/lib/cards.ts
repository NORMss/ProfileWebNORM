/**
 * Разметка карточек списков одной строкой HTML.
 *
 * Списки публикаций и проектов догружаются при прокрутке, поэтому одну и ту же
 * карточку рисуют и сервер (первая пачка — она попадает в HTML и в индекс),
 * и браузер (следующие пачки). Общий шаблон гарантирует, что дорисованные
 * карточки ничем не отличаются от отданных сервером.
 *
 * Модуль намеренно без зависимостей от Node и БД: его импортирует и страница,
 * и клиентский скрипт.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Экранирование текста и значений атрибутов: данные приходят из БД и Telegram. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export interface PostCardData {
  href: string;
  title: string;
  excerpt: string;
  /** URL миниатюры обложки; '' — карточка без картинки */
  cover: string;
  badge: string;
  /** telegram — пост приехал из канала */
  telegram: boolean;
  tgTitle: string;
  date: string;
}

const TELEGRAM_PATH =
  'M19.7773,4.42984 C20.8652,3.97177 22.0315,4.8917 21.8394,6.05639 L19.5705,19.8131 C19.3517,21.1395 17.8949,21.9006 16.678,21.2396 C15.6597,20.6865 14.1489,19.8352 12.7873,18.9455 C12.1074,18.5012 10.0255,17.0766 10.2814,16.0625 C10.5002,15.1954 14.0001,11.9375 16.0001,10 C16.7857,9.23893 16.4279,8.79926 15.5001,9.5 C13.1985,11.2383 9.50332,13.8812 8.28136,14.625 C7.20323,15.2812 6.64031,15.3932 5.96886,15.2812 C4.74273,15.0769 3.60596,14.7605 2.67788,14.3758 C1.42351,13.8558 1.48461,12.132 2.67703,11.63 L19.7773,4.42984 Z';

/** Карточка публикации в списке /publications. */
export function postCardHtml(p: PostCardData): string {
  const cover = p.cover
    ? `<div class="pub-cover"><img src="${esc(p.cover)}" alt="" width="336" height="252" loading="lazy" decoding="async"></div>`
    : '';
  const plane = p.telegram
    ? `<span class="pub-plane" title="${esc(p.tgTitle)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${TELEGRAM_PATH}"/></svg></span>`
    : '';
  return (
    `<a class="pub" href="${esc(p.href)}" data-ripple>${cover}` +
    `<div class="pub-text"><div class="pub-head">` +
    `<span class="badge ${p.telegram ? 'badge-tg' : 'badge-admin'}">${esc(p.badge)}</span>${plane}` +
    `<span class="pub-date">${esc(p.date)}</span></div>` +
    `<h2 class="pub-title">${esc(p.title)}</h2>` +
    `<p class="pub-excerpt">${esc(p.excerpt)}</p></div></a>`
  );
}

export interface ProjectCardData {
  href: string;
  name: string;
  description: string;
  image: string;
  alt: string;
  stars: string;
  downloads: string;
  /** Первая карточка — самая вероятная LCP-картинка, её грузим сразу */
  eager?: boolean;
}

/** Карточка проекта в сетке /projects. */
export function projectCardHtml(p: ProjectCardData): string {
  const priority = p.eager
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy" fetchpriority="low"';
  return (
    `<a class="card" href="${esc(p.href)}" data-ripple>` +
    `<img class="shot" src="${esc(p.image)}" alt="${esc(p.alt)}" width="640" height="320" decoding="async" ${priority}>` +
    `<div class="card-info"><div class="card-top"><strong>${esc(p.name)}</strong>` +
    `<span class="card-stats"><span>★ ${esc(p.stars)}</span><span>↓ ${esc(p.downloads)}</span></span></div>` +
    `<div class="card-desc">${esc(p.description)}</div></div></a>`
  );
}

/**
 * Данные проекта для клиента: по ним браузер и фильтрует список, и рисует
 * карточки следующих пачек. Ужато до однобуквенных ключей — этот JSON едет
 * в HTML каждой загрузки страницы проектов.
 */
export interface ProjectItem {
  /** href */
  h: string;
  /** name */
  n: string;
  /** description */
  d: string;
  /** image */
  i: string;
  /** stars (готовая строка) */
  s: string;
  /** downloads (готовая строка) */
  w: string;
  /** category: hard | vibe */
  c: string;
  /** строка для поиска (уже в нижнем регистре) */
  q: string;
  /** ключи сортировки: звёзды, загрузки, дата релиза */
  ss: number;
  sw: number;
  sr: string;
}
