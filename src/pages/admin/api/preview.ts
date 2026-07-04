import type { APIRoute } from 'astro';
import { renderMarkdown } from '../../../lib/markdown';

export const POST: APIRoute = async ({ request }) => {
  const { md = '' } = (await request.json()) as { md?: string };
  return Response.json({ html: renderMarkdown(md) });
};
