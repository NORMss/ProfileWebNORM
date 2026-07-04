import { config } from './config';

export interface NowPlaying {
  configured: boolean;
  playing: boolean;
  track: {
    title: string;
    artist: string;
    coverUrl: string;
    url: string;
    progressMs: number;
    durationMs: number;
  } | null;
}

let accessToken = '';
let accessTokenExpiresAt = 0;
let cached: NowPlaying | null = null;
let cachedAt = 0;

const CACHE_MS = 30_000;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiresAt - 10_000) return accessToken;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.spotifyRefreshToken,
  });
  const basic = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token → ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

interface SpotifyTrack {
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { images: { url: string; width: number }[] };
  external_urls: { spotify: string };
}

function toTrack(item: SpotifyTrack, progressMs: number): NowPlaying['track'] {
  const cover = [...item.album.images].sort((a, b) => a.width - b.width).find((i) => i.width >= 128);
  return {
    title: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    coverUrl: cover?.url ?? item.album.images[0]?.url ?? '',
    url: item.external_urls.spotify,
    progressMs,
    durationMs: item.duration_ms,
  };
}

/**
 * Текущий трек Spotify; если ничего не играет — последний прослушанный.
 * Ответ кешируется на 30 секунд.
 */
export async function getNowPlaying(): Promise<NowPlaying> {
  if (!config.spotifyClientId || !config.spotifyClientSecret || !config.spotifyRefreshToken) {
    return { configured: false, playing: false, track: null };
  }
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const current = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers });
    if (current.status === 200) {
      const data = (await current.json()) as {
        is_playing: boolean;
        progress_ms: number;
        item: SpotifyTrack | null;
        currently_playing_type?: string;
      };
      if (data.item && data.currently_playing_type !== 'episode') {
        cached = { configured: true, playing: data.is_playing, track: toTrack(data.item, data.progress_ms ?? 0) };
        cachedAt = Date.now();
        return cached;
      }
    }

    const recent = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers });
    if (recent.ok) {
      const data = (await recent.json()) as { items: { track: SpotifyTrack }[] };
      const item = data.items[0]?.track;
      if (item) {
        cached = { configured: true, playing: false, track: toTrack(item, 0) };
        cachedAt = Date.now();
        return cached;
      }
    }
  } catch (e) {
    console.error('[spotify]', e);
  }
  cached = { configured: true, playing: false, track: null };
  cachedAt = Date.now();
  return cached;
}
