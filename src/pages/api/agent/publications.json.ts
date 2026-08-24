import type { APIRoute } from 'astro';
import { agentLang, postSummary } from '../../../lib/agent';
import { countPublishedPosts, getPost, getPublishedPostCards } from '../../../lib/queries';
import { localizePost, localizePostCards } from '../../../lib/translate/content';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
};

/** Публикации для агентов: окно списка либо один пост целиком (?id=). */
export const GET: APIRoute = async ({ url }) => {
  const lang = agentLang(url.searchParams.get('lang'));
  const rawId = url.searchParams.get('id');

  if (rawId !== null) {
    const id = Number.parseInt(rawId, 10);
    const post = Number.isFinite(id) ? getPost(id) : undefined;
    if (!post || post.status !== 'published') {
      return new Response(JSON.stringify({ error: 'not_found', id: rawId }), { status: 404, headers: JSON_HEADERS });
    }
    const content = await localizePost(post, lang, { allowApi: false });
    const card = { ...post, excerpt: content.excerpt };
    return new Response(
      JSON.stringify({ ...postSummary(card, content.title, content.excerpt, lang), body: post.bodyMd }, null, 2),
      { headers: JSON_HEADERS },
    );
  }

  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(50, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20);

  const cards = getPublishedPostCards(limit, offset);
  const localized = await localizePostCards(cards, lang, { allowApi: false });
  const items = cards.map((card) =>
    postSummary(card, localized.get(card.id)?.title ?? card.title, localized.get(card.id)?.excerpt ?? card.excerpt, lang),
  );

  return new Response(JSON.stringify({ total: countPublishedPosts(), offset, items }, null, 2), {
    headers: JSON_HEADERS,
  });
};
