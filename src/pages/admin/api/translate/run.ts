import type { APIRoute } from 'astro';
import { getPost, getPublishedPosts } from '../../../../lib/queries';
import { getSetting } from '../../../../lib/settings';
import {
  TranslateError,
  activeProvider,
  apiBlockReason,
  clearLastError,
  ensureBatch,
  ensureFields,
  getUsage,
  remainingChars,
} from '../../../../lib/translate';
import { FIELDS, postCharCost, postFields, postTranslationState } from '../../../../lib/translate/content';

/** За один вызов переводим не больше этого числа постов — чтобы запрос не висел вечно. */
const BATCH_LIMIT = 15;

/**
 * Ручной запуск перевода из админки:
 *  - post: один пост (в том числе повторный перевод после правки);
 *  - pending: все посты без свежего перевода, пачкой;
 *  - about: блок «обо мне»;
 *  - test: короткая проверка ключа и связи с API.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { scope?: string; id?: number };
  const scope = body.scope ?? 'pending';
  const provider = activeProvider();

  if (!provider.configured && scope !== 'test') {
    return Response.json(
      { ok: false, error: 'Провайдер перевода не настроен: задайте ключ API в переменных окружения' },
      { status: 400 },
    );
  }
  // Ручной запуск при действующей паузе после ошибки: молча ничего не делать нечестно,
  // поэтому объясняем причину — в UI рядом есть кнопка «Сбросить и попробовать снова».
  const blocked = apiBlockReason();
  if (blocked && scope !== 'test') {
    return Response.json(
      {
        ok: false,
        kind: blocked.kind,
        error: `Перевод приостановлен после ошибки (${blocked.kind}) до ${blocked.until}: ${blocked.message}`,
      },
      { status: 409 },
    );
  }
  const before = getUsage().chars;

  if (scope === 'test') {
    try {
      const [text] = await provider.translate(['Проверка связи с переводчиком'], {
        from: 'ru',
        to: 'en',
        html: false,
      });
      clearLastError();
      return Response.json({ ok: true, sample: text, provider: provider.id });
    } catch (e) {
      const kind = e instanceof TranslateError ? e.kind : 'api';
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ ok: false, kind, error: message }, { status: 502 });
    }
  }

  if (scope === 'about') {
    const html = getSetting('about_html');
    if (!html.trim()) return Response.json({ ok: false, error: 'Блок «обо мне» пуст' }, { status: 400 });
    await ensureFields('setting', 'about', [{ field: FIELDS.about, text: html, html: true }], 'en');
    return Response.json({ ok: true, spent: getUsage().chars - before });
  }

  if (scope === 'post') {
    const post = typeof body.id === 'number' ? getPost(body.id) : undefined;
    if (!post) return Response.json({ ok: false, error: 'Пост не найден' }, { status: 404 });
    await ensureFields('post', post.id, postFields(post), 'en');
    return Response.json({
      ok: true,
      spent: getUsage().chars - before,
      state: postTranslationState(post),
    });
  }

  // scope === 'pending' — всё, что ещё не переведено, но в пределах остатка лимита
  const posts = getPublishedPosts().filter((p) => postTranslationState(p) !== 'ready');
  const budget = remainingChars(provider);
  const batch: typeof posts = [];
  let planned = 0;
  for (const post of posts) {
    const cost = postCharCost(post);
    if (batch.length >= BATCH_LIMIT || planned + cost > budget) break;
    batch.push(post);
    planned += cost;
  }
  if (!batch.length) {
    return Response.json({
      ok: true,
      translated: 0,
      spent: 0,
      left: posts.length,
      note: posts.length ? 'Не хватает остатка месячного лимита' : 'Всё уже переведено',
    });
  }

  await ensureBatch(
    batch.map((post) => ({ entity: 'post' as const, id: post.id, fields: postFields(post) })),
    'en',
  );

  const stillPending = getPublishedPosts().filter((p) => postTranslationState(p) !== 'ready').length;
  return Response.json({
    ok: true,
    translated: batch.length,
    spent: getUsage().chars - before,
    left: stillPending,
  });
};
