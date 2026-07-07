import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../lib/queries';
import { config } from '../lib/config';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML в CDATA: последовательность ]]> внутри контента надо разрывать. */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

export const GET: APIRoute = async () => {
  const site = config.siteUrl.replace(/\/$/, '');
  const posts = getPublishedPosts().slice(0, 50);
  const lastBuild = posts[0]?.createdAt ? new Date(posts[0].createdAt) : new Date();

  const items = posts
    .map((p) => {
      const url = `${site}/publications/${p.id}`;
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${cdata(p.bodyHtml)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NORMno — публикации</title>
    <link>${site}/publications</link>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Новости проектов на Kotlin Multiplatform и посты из Telegram-канала</description>
    <language>ru</language>
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
