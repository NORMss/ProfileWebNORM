import type { APIRoute } from 'astro';
import { clearLastError, setTranslateFlag } from '../../../../lib/translate';

/** Переключатели автоперевода: при публикации и лениво при первом заходе. */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { auto?: unknown; lazy?: unknown; clearError?: unknown };
  if (typeof body.auto === 'boolean') setTranslateFlag('autoOnPublish', body.auto);
  if (typeof body.lazy === 'boolean') setTranslateFlag('lazyOnView', body.lazy);
  if (body.clearError === true) clearLastError();
  return Response.json({ ok: true });
};
