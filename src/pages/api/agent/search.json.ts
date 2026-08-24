import type { APIRoute } from 'astro';
import { agentLang, postSummary, projectSummary } from '../../../lib/agent';
import { getVisibleRepoCards, searchPublishedPostCards } from '../../../lib/queries';
import { localizePostCards, localizeRepoDescriptions } from '../../../lib/translate/content';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
};

/** Поиск сразу по проектам и публикациям — один вызов вместо двух. */
export const GET: APIRoute = async ({ url }) => {
  const lang = agentLang(url.searchParams.get('lang'));
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) {
    return new Response(JSON.stringify({ error: 'missing_query' }), { status: 400, headers: JSON_HEADERS });
  }
  const needle = q.toLowerCase();

  const repos = getVisibleRepoCards();
  const descriptions = await localizeRepoDescriptions(repos, lang, { allowApi: false });
  const projects = repos
    .map((repo) => projectSummary(repo, descriptions.get(repo.id) ?? repo.description, lang))
    .filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(needle))
    .slice(0, 10);

  const cards = searchPublishedPostCards(q, 10);
  const localized = await localizePostCards(cards, lang, { allowApi: false });
  const publications = cards.map((card) =>
    postSummary(card, localized.get(card.id)?.title ?? card.title, localized.get(card.id)?.excerpt ?? card.excerpt, lang),
  );

  return new Response(JSON.stringify({ query: q, projects, publications }, null, 2), { headers: JSON_HEADERS });
};
