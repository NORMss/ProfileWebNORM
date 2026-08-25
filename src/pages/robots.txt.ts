import type { APIRoute } from 'astro';
import { config } from '../lib/config';

/**
 * robots.txt отдаётся приложением, а не статикой: на админ-поддомене
 * нужно полностью закрыть индексацию, а на публичном — указать sitemap.
 */
export const GET: APIRoute = async ({ request }) => {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const site = config.siteUrl.replace(/\/$/, '');

  const body =
    host === config.adminHost.toLowerCase()
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *
Allow: /
Allow: /api/agent/
Disallow: /admin
Disallow: /api/
Disallow: /*?hl=

# Обзор сайта для языковых моделей и машинные данные для агентов
# ${site}/llms.txt
# ${site}/api/agent/site.json

Sitemap: ${site}/sitemap.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
