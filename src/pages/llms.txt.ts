import type { APIRoute } from 'astro';
import { config } from '../lib/config';
import { agentLang, publicCategory } from '../lib/agent';
import { countPublishedPosts, getPublishedPostCards, getVisibleRepoCards } from '../lib/queries';
import { getAbout } from '../lib/settings';

/**
 * /llms.txt — короткий обзор сайта для языковых моделей: кто владелец, какие
 * есть проекты и публикации и по каким адресам лежат машинные данные.
 * Один текстовый файл вместо обхода всех страниц: агент читает его первым
 * и дальше идёт точечно в /api/agent/*.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host === config.adminHost.toLowerCase()) return new Response('Not found', { status: 404 });

  const lang = agentLang(url.searchParams.get('lang'));
  const site = config.siteUrl.replace(/\/$/, '');
  const about = getAbout();
  const repos = getVisibleRepoCards();
  const posts = getPublishedPostCards(20);

  const lines: string[] = [
    '# NORMno',
    '',
    `> ${about.text.replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim().slice(0, 400)}`,
    '',
    'Портфолио разработчика приложений на Kotlin Multiplatform: проекты с исходниками',
    'и релизами, публикации и заметки. Сайт двуязычный: русская версия на «чистых»',
    `путях (${site}/), английская под префиксом /en (${site}/en).`,
    '',
    '## Машинные данные',
    '',
    `- [Обзор сайта](${site}/api/agent/site.json): профиль, счётчики, последние релизы`,
    `- [Проекты](${site}/api/agent/projects.json?category=all): фильтр category=all|hard|agents, поиск q=`,
    `- [Проект целиком](${site}/api/agent/projects.json?name=NAME): описание, README, релизы, issues`,
    `- [Публикации](${site}/api/agent/publications.json?limit=20): постранично через offset=`,
    `- [Публикация целиком](${site}/api/agent/publications.json?id=ID): текст поста в markdown`,
    `- [Поиск](${site}/api/agent/search.json?q=QUERY): по проектам и публикациям сразу`,
    `- Любой из адресов принимает lang=ru|en`,
    '',
    'Страницы сайта дополнительно объявляют инструменты WebMCP',
    '(navigator.modelContext) — агент в браузере может вызвать их напрямую.',
    '',
    '## Проекты',
    '',
  ];

  for (const repo of repos) {
    const tag = repo.latestTag ? ` — ${repo.latestTag}` : '';
    lines.push(
      `- [${repo.name}](${site}/projects/${repo.name}) (${publicCategory(repo.category)})${tag}: ` +
        `${repo.description || 'без описания'} · ★ ${repo.stars} · ↓ ${repo.totalDownloads}`,
    );
  }
  if (repos.length === 0) lines.push('- пока нет опубликованных проектов');

  lines.push('', '## Публикации', '');
  for (const post of posts) {
    lines.push(`- [${post.title}](${site}/publications/${post.id}) — ${post.createdAt.slice(0, 10)}`);
  }
  const total = countPublishedPosts();
  if (total > posts.length) {
    lines.push(`- …и ещё ${total - posts.length}: ${site}/api/agent/publications.json?offset=${posts.length}`);
  }
  if (total === 0) lines.push('- пока нет публикаций');

  lines.push('', '## Ссылки', '');
  for (const [label, href] of [
    ['GitHub', about.github],
    ['Telegram', about.telegram],
    ['YouTube', about.youtube],
  ]) {
    if (href) lines.push(`- [${label}](${href})`);
  }
  lines.push('', `Язык ответа: ${lang}. Обновлено: ${new Date().toISOString()}`, '');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
