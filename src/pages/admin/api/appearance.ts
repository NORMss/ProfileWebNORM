import type { APIRoute } from 'astro';
import { getSetting, setSetting } from '../../../lib/settings';
import { isAppearance, parseAppearance } from '../../../lib/appearance';

export const GET: APIRoute = () => Response.json(
  { ok: true, appearance: parseAppearance(getSetting('appearance')) },
  { headers: { 'Cache-Control': 'no-store' } },
);

// /admin middleware enforces the admin host, Basic Auth and same-origin writes.
export const POST: APIRoute = async ({ request }) => {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Некорректный JSON' }, { status: 400 });
  }
  if (!isAppearance(value)) {
    return Response.json({ ok: false, error: 'Недопустимые настройки оформления' }, { status: 400 });
  }
  // One record makes palette and decorations an atomic update, including backups.
  setSetting('appearance', JSON.stringify(value));
  return Response.json({ ok: true, appearance: value });
};
