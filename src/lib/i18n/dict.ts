import type { Lang } from './index';

/**
 * Статические строки интерфейса. Живут в коде, а не в переводчике:
 * их немного, качество важнее, и они не тратят лимит Translation API.
 */
const RU = {
  'nav.home': 'Главная',
  'nav.projects': 'Проекты',
  'nav.pubs': 'Публикации',
  'nav.brandTitle': 'normno.com — на главную',

  'site.description': 'Портфолио NORMno: проекты на Kotlin Multiplatform, публикации и релизы.',
  'site.author': 'NORMno',

  'lang.switchTo': 'Switch to English',
  'lang.switchLabel': 'English',
  'lang.current': 'Русский',
  'lang.machineNote': 'Страница переведена автоматически',

  'home.title': 'NORMno — портфолио и проекты на Kotlin Multiplatform',
  'home.description':
    'Разработка приложений на Kotlin Multiplatform: проекты с исходниками и релизами, публикации и заметки NORMno.',
  'home.avatarAlt': 'Фото NORMno',
  'home.updates': 'Последние обновления',
  'home.updatesSub': 'releases · GitHub',
  'home.updatesEmpty': 'Пока пусто — релизы появятся после первого синка с GitHub.',
  'home.posts': 'Последние публикации',
  'home.allPosts': 'все ›',

  'projects.title': 'Проекты — NORMno',
  'projects.description':
    'Проекты NORMno: приложения на Kotlin Multiplatform и эксперименты с LLM-агентами — исходники, релизы и загрузки.',
  'projects.heading': 'Проекты',
  'projects.tabAll': 'Все',
  'projects.tabHard': 'Hard',
  'projects.tabAgents': 'Agents ✨',
  'projects.search': 'Поиск по проектам…',
  'projects.searchLabel': 'Поиск по проектам',
  'projects.sortLabel': 'Сортировка проектов',
  'projects.sortReleased': 'Сначала новые релизы',
  'projects.sortDownloads': 'По загрузкам',
  'projects.sortStars': 'По звёздам',
  'projects.emptyCategory': 'В этой категории пока нет проектов.',
  'projects.noResults': 'По запросу ничего не найдено.',
  'projects.showAll': 'Показать все проекты',
  'projects.back': 'Все проекты',
  'projects.screenshotAlt': 'Скриншот проекта {name}',
  'projects.stars': 'звёзд',
  'projects.downloads': 'загрузок',
  'projects.readme': 'README.md',
  'projects.releases': 'Релизы',
  'projects.releasesEmpty': 'Релизов пока нет.',
  'projects.issues': 'Открытые issues',
  'projects.issuesEmpty': 'Открытых issues нет 🎉',
  'projects.openGithub': 'Открыть на GitHub ↗',

  'download.latest': 'Скачать последнюю версию',
  'download.one': 'Скачать',
  'download.many': 'Скачать · {count}',
  'download.open': 'Открыть',
  'download.forYourOs': 'для вашей ОС',

  'pubs.title': 'Публикации — NORMno',
  'pubs.description': 'Новости проектов, заметки о разработке и посты из Telegram-канала NORMno.',
  'pubs.heading': 'Публикации',
  'pubs.lead': 'Новости из admin-панели и посты из Telegram-канала',
  'pubs.empty': 'Публикаций пока нет.',
  'pubs.loadMore': 'Показать все публикации',
  'pubs.back': 'Все публикации',
  'pubs.tgSynced': 'Синхронизировано с Telegram-каналом',
  'pubs.tgSyncedLink': 'Публикация синхронизирована с каналом @{channel}',
  'pubs.badgeTelegram': 'TELEGRAM',
  'pubs.badgeAdmin': 'ADMIN',
  'pubs.rssTitle': 'NORMno — публикации',
  'pubs.rssDescription': 'Новости проектов на Kotlin Multiplatform и посты из Telegram-канала',

  'heatmap.title': 'Активность на GitHub',
  'heatmap.contributions': '{count} контрибуций за год',
  'heatmap.claudeCommits': '{count} коммитов с Claude за год',
  'heatmap.source': 'Источник активности',
  'heatmap.aria': 'Тепловая карта: {count} контрибуций за последний год',
  'heatmap.withClaude': 'с Claude',
  'heatmap.less': 'меньше',
  'heatmap.more': 'больше',

  'spotify.now': 'СЕЙЧАС ИГРАЕТ',
  'spotify.recent': 'НЕДАВНО ИГРАЛО',
  'spotify.coverAlt': 'Обложка альбома',

  'notFound.title': '404 — страница не найдена',
  'notFound.heading': '404',
  'notFound.text': 'Такой страницы нет. Возможно, она уехала в другой релиз.',
  'notFound.home': 'На главную',
} as const;

export type StringKey = keyof typeof RU;

const EN: Record<StringKey, string> = {
  'nav.home': 'Home',
  'nav.projects': 'Projects',
  'nav.pubs': 'Blog',
  'nav.brandTitle': 'normno.com — home',

  'site.description': "NORMno's portfolio: Kotlin Multiplatform projects, posts and releases.",
  'site.author': 'NORMno',

  'lang.switchTo': 'Показать русскую версию',
  'lang.switchLabel': 'Русский',
  'lang.current': 'English',
  'lang.machineNote': 'This page was machine-translated from Russian',

  'home.title': 'NORMno — Kotlin Multiplatform developer portfolio',
  'home.description':
    'Kotlin Multiplatform app development: open-source projects with releases, plus posts and notes by NORMno.',
  'home.avatarAlt': 'Photo of NORMno',
  'home.updates': 'Latest updates',
  'home.updatesSub': 'releases · GitHub',
  'home.updatesEmpty': 'Nothing here yet — releases show up after the first GitHub sync.',
  'home.posts': 'Latest posts',
  'home.allPosts': 'all ›',

  'projects.title': 'Projects — NORMno',
  'projects.description':
    'NORMno projects: Kotlin Multiplatform apps and LLM-agent experiments — sources, releases and downloads.',
  'projects.heading': 'Projects',
  'projects.tabAll': 'All',
  'projects.tabHard': 'Hard',
  'projects.tabAgents': 'Agents ✨',
  'projects.search': 'Search projects…',
  'projects.searchLabel': 'Search projects',
  'projects.sortLabel': 'Sort projects',
  'projects.sortReleased': 'Newest releases first',
  'projects.sortDownloads': 'By downloads',
  'projects.sortStars': 'By stars',
  'projects.emptyCategory': 'No projects in this category yet.',
  'projects.noResults': 'Nothing matches your search.',
  'projects.showAll': 'Show all projects',
  'projects.back': 'All projects',
  'projects.screenshotAlt': 'Screenshot of {name}',
  'projects.stars': 'stars',
  'projects.downloads': 'downloads',
  'projects.readme': 'README.md',
  'projects.releases': 'Releases',
  'projects.releasesEmpty': 'No releases yet.',
  'projects.issues': 'Open issues',
  'projects.issuesEmpty': 'No open issues 🎉',
  'projects.openGithub': 'Open on GitHub ↗',

  'download.latest': 'Download latest version',
  'download.one': 'Download',
  'download.many': 'Download · {count}',
  'download.open': 'Open',
  'download.forYourOs': 'for your OS',

  'pubs.title': 'Blog — NORMno',
  'pubs.description': 'Project news, development notes and posts from the NORMno Telegram channel.',
  'pubs.heading': 'Blog',
  'pubs.lead': 'Posts written here and imported from the Telegram channel',
  'pubs.empty': 'No posts yet.',
  'pubs.loadMore': 'Show all posts',
  'pubs.back': 'All posts',
  'pubs.tgSynced': 'Synced with the Telegram channel',
  'pubs.tgSyncedLink': 'This post is synced with the @{channel} channel',
  'pubs.badgeTelegram': 'TELEGRAM',
  'pubs.badgeAdmin': 'ADMIN',
  'pubs.rssTitle': 'NORMno — blog',
  'pubs.rssDescription': 'News about Kotlin Multiplatform projects and posts from the Telegram channel',

  'heatmap.title': 'GitHub activity',
  'heatmap.contributions': '{count} contributions in the last year',
  'heatmap.claudeCommits': '{count} commits with Claude in the last year',
  'heatmap.source': 'Activity source',
  'heatmap.aria': 'Heatmap: {count} contributions in the last year',
  'heatmap.withClaude': 'with Claude',
  'heatmap.less': 'less',
  'heatmap.more': 'more',

  'spotify.now': 'NOW PLAYING',
  'spotify.recent': 'RECENTLY PLAYED',
  'spotify.coverAlt': 'Album cover',

  'notFound.title': '404 — page not found',
  'notFound.heading': '404',
  'notFound.text': 'This page does not exist. Maybe it shipped in another release.',
  'notFound.home': 'Go home',
};

const DICT: Record<Lang, Record<StringKey, string>> = { ru: RU, en: EN };

/** t('en', 'download.many', { count: 3 }) → 'Download · 3'. */
export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  let value: string = DICT[lang]?.[key] ?? RU[key];
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

/** Готовая функция перевода для страницы: const tt = translator(lang). */
export function translator(lang: Lang) {
  return (key: StringKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}
