import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config';
import * as schema from './schema';

const DDL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  html_url TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  total_downloads INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'hard',
  visible INTEGER NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL DEFAULT '',
  cover_file TEXT NOT NULL DEFAULT '',
  readme_images TEXT NOT NULL DEFAULT '[]',
  readme_html TEXT NOT NULL DEFAULT '',
  latest_tag TEXT NOT NULL DEFAULT '',
  latest_asset_url TEXT NOT NULL DEFAULT '',
  pushed_at TEXT NOT NULL DEFAULT '',
  synced_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  downloads INTEGER NOT NULL DEFAULT 0,
  html_url TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_releases_repo ON releases(repo_id);
CREATE INDEX IF NOT EXISTS idx_releases_date ON releases(published_at DESC);
CREATE TABLE IF NOT EXISTS release_assets (
  id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  download_url TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_assets_release ON release_assets(release_id);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  html_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  comments INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_issues_repo ON issues(repo_id);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'published',
  tg_message_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(created_at DESC);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  about_text:
    '# Всем, привет 👋\n\nГорю разработкой приложений на разные платформы с помощью KMP. На этом сайте можно найти проекты, созданные мной и с помощью LLM/агентов.',
  link_telegram: 'https://t.me/normno',
  link_youtube: 'https://youtube.com/@normno',
  link_github: 'https://github.com/NORMss',
};

function createDb() {
  const file = path.resolve(config.dbPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec(DDL);
  // Миграции для БД, созданных прошлыми версиями (ALTER TABLE идемпотентен через catch)
  for (const ddl of [
    "ALTER TABLE repos ADD COLUMN cover_file TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE repos ADD COLUMN readme_images TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try {
      sqlite.exec(ddl);
    } catch {
      /* колонка уже есть */
    }
  }
  const insert = sqlite.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value);
  return drizzle(sqlite, { schema });
}

// Один экземпляр на процесс (в dev модуль может перезагружаться — храним в globalThis).
const globalStore = globalThis as { __siteDb?: ReturnType<typeof createDb> };
export const db = (globalStore.__siteDb ??= createDb());
export { schema };
