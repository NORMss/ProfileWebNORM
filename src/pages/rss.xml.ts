import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../lib/queries';
import { config } from '../lib/config';
import { DEFAULT_LANG, localePath } from '../lib/i18n';
import { t } from '../lib/i18n/dict';
import { FIELDS, localizePostCards } from '../lib/translate/content';
import { cachedFields } from '../lib/translate';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML в CDATA: последовательность ]]> внутри контента надо разрывать. */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

export const GET: APIRoute = async ({ locals }) => {
  const lang = locals.lang ?? DEFAULT_LANG;
  const site = config.siteUrl.replace(/\/$/, '');
  const posts = getPublishedPosts().slice(0, 50);
  const lastBuild = posts[0]?.createdAt ? new Date(posts[0].createdAt) : new Date();
  // Лента берёт только готовые переводы: тратить лимит API на запрос робота-читалки незачем
  const cards = await localizePostCards(posts, lang, { allowApi: false });

  const items = posts
    .map((p) => {
      const url = `${site}${localePath(`/publications/${p.id}`, lang)}`;
      // allowStale: лента остаётся английской, даже если пост правили
      // и новый перевод ещё не сделан
      const body = cachedFields('post', p.id, [{ field: FIELDS.body, text: p.bodyHtml, html: true }], lang, true)
        .values[FIELDS.body];
      return `    <item>
      <title>${esc(cards.get(p.id)?.title ?? p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${cdata(body)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(t(lang, 'pubs.rssTitle'))}</title>
    <link>${site}${localePath('/publications', lang)}</link>
    <atom:link href="${site}${localePath('/rss.xml', lang)}" rel="self" type="application/rss+xml"/>
    <description>${esc(t(lang, 'pubs.rssDescription'))}</description>
    <language>${lang}</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
