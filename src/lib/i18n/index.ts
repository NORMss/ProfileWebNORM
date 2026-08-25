/**
 * Языки сайта и правила локализованного роутинга.
 *
 * Русская версия живёт на «чистых» путях (/, /projects, /publications/1),
 * английская — под префиксом /en (/en, /en/projects, /en/publications/1).
 * Разные URL для разных языков — требование Google к многоязычным сайтам:
 * так обе версии индексируются отдельно и связываются через hreflang.
 */
export const LOCALES = ['ru', 'en'] as const;
export type Lang = (typeof LOCALES)[number];

export const DEFAULT_LANG: Lang = 'ru';
/** Куки с выбором пользователя: заданный явно язык важнее Accept-Language. */
export const LANG_COOKIE = 'lang';
/** ?hl=en — переключение языка ссылкой (работает без JS: middleware ставит куки и редиректит). */
export const LANG_QUERY = 'hl';
/** Подсказка о другой языковой версии закрыта посетителем — больше не показываем. */
export const LANG_HINT_COOKIE = 'lang_hint';
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLang(value: string): value is Lang {
  return (LOCALES as readonly string[]).includes(value);
}

/** Противоположный язык — для кнопки-переключателя. */
export function otherLang(lang: Lang): Lang {
  return lang === 'ru' ? 'en' : 'ru';
}

/** '/en/publications/3' → { lang: 'en', path: '/publications/3' }; '/projects' → { lang: 'ru', path: '/projects' }. */
export function splitLangPath(pathname: string): { lang: Lang; path: string } {
  for (const lang of LOCALES) {
    if (lang === DEFAULT_LANG) continue;
    if (pathname === `/${lang}`) return { lang, path: '/' };
    if (pathname.startsWith(`/${lang}/`)) return { lang, path: pathname.slice(lang.length + 1) };
  }
  return { lang: DEFAULT_LANG, path: pathname };
}

/** Путь без языкового префикса → путь на нужном языке. */
export function localePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return clean;
  return clean === '/' ? `/${lang}` : `/${lang}${clean}`;
}

/** Абсолютный URL страницы на нужном языке — для canonical, hreflang, sitemap и og:url. */
export function localeUrl(path: string, lang: Lang, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}${localePath(path, lang)}`;
}

/**
 * Язык из заголовка Accept-Language: русский — только если он реально
 * в списке предпочтений посетителя, во всех остальных случаях английский.
 *
 * Это подсказка, а не решение: по ней страница предлагает другую языковую
 * версию ссылкой, но никуда не перебрасывает (см. src/middleware.ts).
 */
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return DEFAULT_LANG;
  const items = header
    .split(',')
    .map((raw) => {
      const [tag, ...params] = raw.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number.parseFloat(q.split('=')[1]) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((i) => i.tag && i.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of items) {
    if (tag === '*') continue;
    const primary = tag.split('-')[0];
    // Кириллические локали постсоветских стран обычно понимают русский лучше английского
    if (['ru', 'be', 'uk', 'kk', 'ky', 'uz', 'tg', 'mo'].includes(primary)) return 'ru';
    return 'en';
  }
  return DEFAULT_LANG;
}

/** Пути, которые не участвуют в языковом редиректе (статика, медиа, API, фиды). */
export function isNonPageRequest(path: string): boolean {
  if (
    path.startsWith('/_astro/') ||
    path.startsWith('/_image') ||
    path.startsWith('/api/') ||
    path.startsWith('/media/') ||
    path.startsWith('/admin')
  ) {
    return true;
  }
  // Только известные расширения: имя проекта вида «my.app» — обычная страница
  return /\.(xml|txt|json|ico|svg|png|jpe?g|webp|gif|css|js|map|webmanifest|pdf)$/i.test(path);
}
