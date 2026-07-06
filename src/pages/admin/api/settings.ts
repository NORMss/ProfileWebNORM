import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/settings';

/** Разрешённые к изменению настройки и их допустимые значения. */
const ALLOWED: Record<string, (v: string) => boolean> = {
  projects_sort: (v) => ['released', 'downloads', 'stars'].includes(v),
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as Record<string, unknown>;
  for (const [key, validate] of Object.entries(ALLOWED)) {
    const value = body[key];
    if (typeof value === 'string') {
      if (!validate(value)) {
        return Response.json({ ok: false, error: `Недопустимое значение ${key}` }, { status: 400 });
      }
      setSetting(key, value);
    }
  }
  return Response.json({ ok: true });
};
