import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/settings';
import { renderMarkdown } from '../../../lib/markdown';
import { autoTranslateOnPublish } from '../../../lib/translate';
import { translateAboutAfterSave } from '../../../lib/translate/content';

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { text?: string; telegram?: string; youtube?: string; github?: string };
  if (typeof body.text === 'string') {
    // Текст «обо мне» — markdown; HTML рендерим один раз при сохранении
    setSetting('about_text', body.text.trim());
    setSetting('about_html', renderMarkdown(body.text.trim()));
    if (autoTranslateOnPublish()) translateAboutAfterSave();
  }
  if (typeof body.telegram === 'string') setSetting('link_telegram', body.telegram.trim());
  if (typeof body.youtube === 'string') setSetting('link_youtube', body.youtube.trim());
  if (typeof body.github === 'string') setSetting('link_github', body.github.trim());
  return Response.json({ ok: true });
};
