import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';
import { agentLang, latestReleases, profile } from '../../../lib/agent';
import { countPublishedPosts, getVisibleRepoCards } from '../../../lib/queries';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Корень машинного API: кто владелец сайта, что здесь есть и куда идти
 * дальше. С него начинают и инструменты WebMCP, и агенты, пришедшие по
 * ссылке из /llms.txt.
 */
export const GET: APIRoute = async ({ url }) => {
  const lang = agentLang(url.searchParams.get('lang'));
  const site = config.siteUrl.replace(/\/$/, '');
  const repos = getVisibleRepoCards();

  return new Response(
    JSON.stringify(
      {
        site,
        generatedAt: new Date().toISOString(),
        profile: profile(lang),
        counts: {
          projects: repos.length,
          hard: repos.filter((r) => r.category !== 'vibe').length,
          agents: repos.filter((r) => r.category === 'vibe').length,
          publications: countPublishedPosts(),
        },
        latestReleases: latestReleases(5, lang),
        endpoints: {
          projects: `${site}/api/agent/projects.json?category=all&q=&limit=50`,
          project: `${site}/api/agent/projects.json?name=<project>`,
          publications: `${site}/api/agent/publications.json?limit=20&offset=0`,
          publication: `${site}/api/agent/publications.json?id=<id>`,
          search: `${site}/api/agent/search.json?q=<query>`,
          overview: `${site}/llms.txt`,
          sitemap: `${site}/sitemap.xml`,
          rss: `${site}/rss.xml`,
        },
      },
      null,
      2,
    ),
    { headers: JSON_HEADERS },
  );
};
