import { config } from './config';
import { LOCALES, localeUrl, type Lang } from './i18n';

/** Абсолютный URL страницы на конкретном языке. */
export function absoluteUrl(path: string, lang: Lang): string {
  return localeUrl(path, lang, config.siteUrl);
}

export interface AlternateLink {
  hreflang: string;
  href: string;
}

/**
 * hreflang-альтернативы страницы: обе языковые версии плюс x-default.
 * Именно они объясняют Google, что /publications/1 и /en/publications/1 —
 * одна страница на разных языках, а не дубли.
 */
export function alternates(path: string): AlternateLink[] {
  const list: AlternateLink[] = LOCALES.map((lang) => ({ hreflang: lang, href: absoluteUrl(path, lang) }));
  list.push({ hreflang: 'x-default', href: absoluteUrl(path, 'ru') });
  return list;
}

/** og:locale в формате, который ждут соцсети. */
export function ogLocale(lang: Lang): string {
  return lang === 'ru' ? 'ru_RU' : 'en_US';
}

interface JsonLdNode {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
}

/** Профиль автора — Google связывает сайт с человеком и его соцсетями. */
export function personJsonLd(lang: Lang, about: { telegram: string; youtube: string; github: string }): JsonLdNode {
  const sameAs = [about.github, about.telegram, about.youtube].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'NORMno',
    url: absoluteUrl('/', lang),
    image: `${config.siteUrl.replace(/\/$/, '')}/avatar.svg`,
    jobTitle: lang === 'ru' ? 'Разработчик мобильных приложений' : 'Mobile application developer',
    description:
      lang === 'ru'
        ? 'Разработчик приложений на Kotlin Multiplatform: проекты, релизы и публикации.'
        : 'Kotlin Multiplatform application developer: projects, releases and posts.',
    knowsAbout: ['Kotlin Multiplatform', 'Android', 'Compose Multiplatform', 'Kotlin', 'LLM agents'],
    sameAs,
  };
}

export function webSiteJsonLd(lang: Lang): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'NORMno',
    url: absoluteUrl('/', lang),
    inLanguage: lang,
    author: { '@type': 'Person', name: 'NORMno' },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], lang: Lang): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path, lang),
    })),
  };
}

export function blogPostingJsonLd(
  post: { title: string; excerpt: string; createdAt: string; updatedAt: string; path: string },
  lang: Lang,
): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    inLanguage: lang,
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(post.path, lang) },
    author: { '@type': 'Person', name: 'NORMno', url: absoluteUrl('/', lang) },
    publisher: { '@type': 'Person', name: 'NORMno', url: absoluteUrl('/', lang) },
  };
}

export function softwareJsonLd(
  repo: { name: string; description: string; htmlUrl: string; stars: number; path: string; image: string },
  lang: Lang,
): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: repo.name,
    description: repo.description,
    codeRepository: repo.htmlUrl,
    url: absoluteUrl(repo.path, lang),
    image: repo.image,
    inLanguage: lang,
    programmingLanguage: 'Kotlin',
    author: { '@type': 'Person', name: 'NORMno', url: absoluteUrl('/', lang) },
  };
}
