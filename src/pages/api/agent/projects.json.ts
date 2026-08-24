import type { APIRoute } from 'astro';
import { agentLang, dbCategory, projectDetails, projectSummary } from '../../../lib/agent';
import { getRepoByName, getVisibleRepoCards } from '../../../lib/queries';
import { localizeRepo, localizeRepoDescriptions } from '../../../lib/translate/content';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Проекты для агентов: список с фильтром по категории и поиском либо один
 * проект целиком (?name=). Переводы берутся из кеша — машинный запрос не
 * должен тратить лимит Translation API.
 */
export const GET: APIRoute = async ({ url }) => {
  const lang = agentLang(url.searchParams.get('lang'));
  const name = (url.searchParams.get('name') ?? '').trim();

  if (name) {
    const repo = getRepoByName(name);
    if (!repo) return new Response(JSON.stringify({ error: 'not_found', name }), { status: 404, headers: JSON_HEADERS });
    const content = await localizeRepo(repo, lang, { allowApi: false });
    const details = projectDetails(name, content.description, content.readmeHtml, lang);
    return new Response(JSON.stringify(details, null, 2), { headers: JSON_HEADERS });
  }

  const category = dbCategory(url.searchParams.get('category'));
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(100, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50);

  const repos = getVisibleRepoCards(category);
  const descriptions = await localizeRepoDescriptions(repos, lang, { allowApi: false });
  const matched = repos
    .map((repo) => projectSummary(repo, descriptions.get(repo.id) ?? repo.description, lang))
    .filter((p) => !q || `${p.name} ${p.description}`.toLowerCase().includes(q));

  // total — сколько всего подошло под фильтр, а не сколько влезло в limit:
  // иначе агент не поймёт, что список обрезан.
  return new Response(JSON.stringify({ total: matched.length, items: matched.slice(0, limit) }, null, 2), {
    headers: JSON_HEADERS,
  });
};
