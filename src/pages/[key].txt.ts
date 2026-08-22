import type { APIRoute } from 'astro';
import { config } from '../lib/config';

/**
 * Файл подтверждения ключа IndexNow: поисковик проверяет, что по адресу
 * https://<домен>/<ключ>.txt лежит сам ключ. Любой другой запрос — 404.
 */
export const GET: APIRoute = async ({ params }) => {
  const key = config.indexNowKey;
  if (!key || params.key !== key) return new Response('Not found', { status: 404 });
  return new Response(key, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
};
