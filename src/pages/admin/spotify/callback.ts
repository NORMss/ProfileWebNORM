import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';
import { setSetting } from '../../../lib/settings';
import { resetSpotifyCache } from '../../../lib/spotify';

function page(title: string, message: string, ok: boolean): Response {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:#07080f;color:#f2f3f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  .card{max-width:420px;padding:28px;border-radius:24px;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.13);text-align:center}
  h1{margin:0 0 10px;font-size:20px}
  p{margin:0 0 20px;font-size:14.5px;line-height:1.5;color:rgba(255,255,255,.7);overflow-wrap:anywhere}
  a{display:inline-block;padding:11px 22px;border-radius:16px;text-decoration:none;font-weight:700;
    color:#07080f;background:linear-gradient(135deg,#9db7ff,#e2e9ff)}
</style></head><body><div class="card">
<h1>${ok ? '✓ ' : '⚠ '}${title}</h1><p>${message}</p><a href="/admin">Вернуться в админку</a>
</div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': 'sp_oauth_state=; Path=/admin; HttpOnly; Max-Age=0',
    },
  });
}

/** Шаг 2 OAuth: меняем code на refresh token и сохраняем его в БД. */
export const GET: APIRoute = async ({ url, request }) => {
  const error = url.searchParams.get('error');
  if (error) return page('Доступ не выдан', `Spotify вернул ошибку: ${error}`, false);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (request.headers.get('cookie') ?? '').match(/sp_oauth_state=([a-f0-9]+)/)?.[1];
  if (!code) return page('Нет кода авторизации', 'Spotify не передал параметр code — начните подключение заново.', false);
  if (!state || state !== cookieState) {
    return page('Проверка не пройдена', 'Параметр state не совпал — начните подключение заново.', false);
  }

  const basic = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotifyRedirectUri,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !data.refresh_token) {
    return page('Не удалось получить токен', data.error_description ?? data.error ?? `HTTP ${res.status}`, false);
  }

  setSetting('spotify_refresh_token', data.refresh_token);
  resetSpotifyCache();
  return page('Spotify подключён', 'Виджет «сейчас играет» заработает на главной в течение минуты.', true);
};
