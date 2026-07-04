import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** key-value настройки: about_text, link_telegram, link_youtube, link_github, tg_offset, tg_last_import… */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

export const repos = sqliteTable('repos', {
  id: integer('id').primaryKey(), // GitHub repo id
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  description: text('description').notNull().default(''),
  htmlUrl: text('html_url').notNull(),
  stars: integer('stars').notNull().default(0),
  totalDownloads: integer('total_downloads').notNull().default(0),
  /** hard | vibe — задаётся в админке */
  category: text('category').notNull().default('hard'),
  /** 1 — показывать на сайте */
  visible: integer('visible').notNull().default(1),
  /** URL картинки-обложки; по умолчанию og-image GitHub, можно заменить в БД */
  imageUrl: text('image_url').notNull().default(''),
  readmeHtml: text('readme_html').notNull().default(''),
  latestTag: text('latest_tag').notNull().default(''),
  latestAssetUrl: text('latest_asset_url').notNull().default(''),
  pushedAt: text('pushed_at').notNull().default(''),
  syncedAt: text('synced_at').notNull().default(''),
});

export const releases = sqliteTable('releases', {
  id: integer('id').primaryKey(), // GitHub release id
  repoId: integer('repo_id').notNull(),
  tag: text('tag').notNull(),
  name: text('name').notNull().default(''),
  notes: text('notes').notNull().default(''),
  publishedAt: text('published_at').notNull().default(''),
  downloads: integer('downloads').notNull().default(0),
  htmlUrl: text('html_url').notNull().default(''),
});

export const releaseAssets = sqliteTable('release_assets', {
  id: integer('id').primaryKey(), // GitHub asset id
  releaseId: integer('release_id').notNull(),
  name: text('name').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  downloadUrl: text('download_url').notNull(),
  size: integer('size').notNull().default(0),
});

export const issues = sqliteTable('issues', {
  id: integer('id').primaryKey(), // GitHub issue id
  repoId: integer('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  htmlUrl: text('html_url').notNull(),
  createdAt: text('created_at').notNull().default(''),
  comments: integer('comments').notNull().default(0),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull().default(''),
  bodyHtml: text('body_html').notNull().default(''),
  /** admin | telegram */
  source: text('source').notNull().default('admin'),
  /** published | draft */
  status: text('status').notNull().default('published'),
  tgMessageId: integer('tg_message_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
