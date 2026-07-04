import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { renderMarkdown } from './markdown';

export function getSetting(key: string): string {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? '';
}

export function setSetting(key: string, value: string): void {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function getAbout() {
  return {
    text: getSetting('about_text'),
    telegram: getSetting('link_telegram'),
    youtube: getSetting('link_youtube'),
    github: getSetting('link_github'),
  };
}

/** HTML блока «обо мне»: кеш в settings, при отсутствии рендерится из markdown. */
export function getAboutHtml(): string {
  const cached = getSetting('about_html');
  if (cached) return cached;
  const html = renderMarkdown(getSetting('about_text'));
  if (html) setSetting('about_html', html);
  return html;
}

/** Аватар на главной: загруженный через админку файл или плейсхолдер. */
export function getAvatarUrl(): string {
  const file = getSetting('avatar_file');
  if (!file) return '/avatar.svg';
  return `/media/avatar?v=${getSetting('avatar_version') || '0'}`;
}
