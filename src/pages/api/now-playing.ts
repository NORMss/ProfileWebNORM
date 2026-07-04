import type { APIRoute } from 'astro';
import { getNowPlaying } from '../../lib/spotify';

export const GET: APIRoute = async () => {
  const data = await getNowPlaying();
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=20',
    },
  });
};
