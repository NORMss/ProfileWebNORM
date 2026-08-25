import { config } from './config';
import { formatDate } from './format';
import { DEFAULT_LANG, isLang, localeUrl, type Lang } from './i18n';
import { excerptFromHtml } from './markdown';
import {
  getIssues,
  getLatestUpdates,
  getPost,
  getPublishedPostCards,
  getReleases,
  getRepoByName,
  getVisibleRepoCards,
  repoImage,
  searchPublishedPostCards,
  type PostCard,
  type RepoCard,
} from './queries';
import { absoluteAsset } from './seo';
import { getAbout } from './settings';

/**
 * Данные сайта в машинном виде — для ИИ-агентов.
 *
 * Тем же набором пользуются три вещи: JSON-эндпоинты /api/agent/*, инструменты
 * WebMCP (их вызывает агент прямо в браузере посетителя) и текстовый обзор
 * /llms.txt. Поэтому формат ответов один и описан здесь, а не в каждом роуте.
 */

/** Категория проекта так, как она называется на сайте: hard | agents. */
export function publicCategory(category: string): 'hard' | 'agents' {
  return category === 'vibe' ? 'agents' : 'hard';
}

/** 'hard' | 'agents' | 'all' → значение категории в базе. */
export function dbCategory(value: string | null | undefined): 'hard' | 'vibe' | undefined {
  if (value === 'hard') return 'hard';
  if (value === 'agents' || value === 'vibe') return 'vibe';
  return undefined;
}

export function agentLang(raw: string | null | undefined): Lang {
  return raw && isLang(raw) ? raw : DEFAULT_LANG;
}

function url(path: string, lang: Lang): string {
  return localeUrl(path, lang, config.siteUrl);
}

export interface ProjectSummary {
  name: string;
  description: string;
  category: 'hard' | 'agents';
  stars: number;
  downloads: number;
  latestTag: string;
  updatedAt: string;
  url: string;
  repository: string;
  image: string;
}

export function projectSummary(repo: RepoCard, description: string, lang: Lang): ProjectSummary {
  return {
    name: repo.name,
    description,
    category: publicCategory(repo.category),
    stars: repo.stars,
    downloads: repo.totalDownloads,
    latestTag: repo.latestTag,
    updatedAt: repo.pushedAt,
    url: url(`/projects/${repo.name}`, lang),
    repository: repo.htmlUrl,
    image: absoluteAsset(repoImage(repo)),
  };
}

export interface PostSummary {
  id: number;
  title: string;
  excerpt: string;
  source: string;
  publishedAt: string;
  url: string;
  image: string;
}

export function postSummary(card: PostCard, title: string, excerpt: string, lang: Lang): PostSummary {
  return {
    id: card.id,
    title,
    excerpt,
    source: card.source,
    publishedAt: card.createdAt,
    url: url(`/publications/${card.id}`, lang),
    image: card.coverUrl ? `${config.siteUrl.replace(/\/$/, '')}${card.coverUrl}` : '',
  };
}

/** Профиль владельца сайта: кто это, чем занимается и где его искать. */
export function profile(lang: Lang) {
  const about = getAbout();
  return {
    name: 'NORMno',
    role:
      lang === 'ru'
        ? 'Разработчик приложений на Kotlin Multiplatform'
        : 'Kotlin Multiplatform application developer',
    summary: about.text,
    site: url('/', lang),
    links: {
      github: about.github,
      telegram: about.telegram,
      youtube: about.youtube,
    },
    languages: ['ru', 'en'],
  };
}

/** Проект целиком: описание, релизы и открытые issues. */
export function projectDetails(name: string, description: string, readmeHtml: string, lang: Lang) {
  const repo = getRepoByName(name);
  if (!repo) return null;
  const releases = getReleases(repo.id);
  return {
    ...projectSummary(repo, description, lang),
    readme: excerptFromHtml(readmeHtml, 4000),
    releases: releases.slice(0, 10).map((r) => ({
      tag: r.tag,
      name: r.name,
      publishedAt: r.publishedAt,
      publishedOn: formatDate(r.publishedAt, lang),
      downloads: r.downloads,
      url: r.htmlUrl,
    })),
    openIssues: getIssues(repo.id)
      .slice(0, 10)
      .map((i) => ({ number: i.number, title: i.title, url: i.htmlUrl })),
  };
}

/** Последние релизы по всем проектам — «что нового» одним запросом. */
export function latestReleases(limit: number, lang: Lang) {
  return getLatestUpdates(limit).map((u) => ({
    project: u.repo.name,
    tag: u.tag,
    name: u.name,
    publishedAt: u.publishedAt,
    url: url(`/projects/${u.repo.name}`, lang),
  }));
}

export { getPost, getPublishedPostCards, getVisibleRepoCards, searchPublishedPostCards };
