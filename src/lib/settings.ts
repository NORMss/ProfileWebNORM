import { eq } from 'drizzle-orm';
import { db, schema } from './db';

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
