import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { config } from '../../../lib/config';

const SCOPES = 'user-read-currently-playing user-read-recently-played';

/** Шаг 1 OAuth: отправляем в Spotify за разрешением (кнопка в админке). */
export const GET: APIRoute = async () => {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    return new Response('Задайте SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET в .env', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', config.spotifyClientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.spotifyRedirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);

  const secure = config.spotifyRedirectUri.startsWith('https://') ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `sp_oauth_state=${state}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
};
