import type { APIRoute } from 'astro';
import { runSync } from '../../../lib/sync';

export const POST: APIRoute = async () => {
  const result = await runSync();
  return Response.json({ ok: true, ...result });
};
