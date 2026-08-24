import type { APIRoute } from 'astro';
import { getPublishedPostCards, getVisibleRepoCards } from '../lib/queries';
import { LOCALES } from '../lib/i18n';
import { absoluteUrl } from '../lib/seo';

interface Entry {
  path: string;
  lastmod?: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function iso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Карта сайта сразу для двух языков: у каждой страницы перечислены
 * hreflang-альтернативы, чтобы Google не считал /en/... дублем.
 */
export const GET: APIRoute = async () => {
  // Карте нужны только имена и даты — README и тексты постов сюда не читаем
  const repos = getVisibleRepoCards();
  const posts = getPublishedPostCards();
  const newestPost = posts[0]?.updatedAt || posts[0]?.createdAt || '';
  const newestRepo = repos.map((r) => r.pushedAt).sort().at(-1) ?? '';

  const entries: Entry[] = [
    { path: '/', lastmod: iso(newestPost || newestRepo), changefreq: 'daily', priority: '1.0' },
    { path: '/projects', lastmod: iso(newestRepo), changefreq: 'weekly', priority: '0.9' },
    { path: '/publications', lastmod: iso(newestPost), changefreq: 'daily', priority: '0.9' },
    ...repos.map<Entry>((repo) => ({
      path: `/projects/${repo.name}`,
      lastmod: iso(repo.pushedAt),
      changefreq: 'weekly',
      priority: '0.8',
    })),
    ...posts.map<Entry>((post) => ({
      path: `/publications/${post.id}`,
      lastmod: iso(post.updatedAt || post.createdAt),
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ];

  const urls = entries
    .flatMap((entry) =>
      LOCALES.map((lang) => {
        const alternates = [
          ...LOCALES.map((l) => `      <xhtml:link rel="alternate" hreflang="${l}" href="${esc(absoluteUrl(entry.path, l))}"/>`),
          `      <xhtml:link rel="alternate" hreflang="x-default" href="${esc(absoluteUrl(entry.path, 'ru'))}"/>`,
        ].join('\n');
        return `  <url>
    <loc>${esc(absoluteUrl(entry.path, lang))}</loc>
${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ''}    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${alternates}
  </url>`;
      }),
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
