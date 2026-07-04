import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from './db';

export type Repo = typeof schema.repos.$inferSelect;
export type Release = typeof schema.releases.$inferSelect;
export type ReleaseAsset = typeof schema.releaseAssets.$inferSelect;
export type Issue = typeof schema.issues.$inferSelect;
export type Post = typeof schema.posts.$inferSelect;

/** Обложка проекта: загруженная/заданная вручную или og-image GitHub. */
export function repoImage(repo: Pick<Repo, 'imageUrl' | 'fullName'>): string {
  return repo.imageUrl || `https://opengraph.githubassets.com/1/${repo.fullName}`;
}

export function getVisibleRepos(category?: 'hard' | 'vibe'): Repo[] {
  const cond = category
    ? and(eq(schema.repos.visible, 1), eq(schema.repos.category, category))
    : eq(schema.repos.visible, 1);
  return db.select().from(schema.repos).where(cond).orderBy(desc(schema.repos.pushedAt)).all();
}

export function getAllRepos(): Repo[] {
  return db.select().from(schema.repos).orderBy(desc(schema.repos.pushedAt)).all();
}

export function getRepoByName(name: string): Repo | undefined {
  return db
    .select()
    .from(schema.repos)
    .where(and(eq(schema.repos.name, name), eq(schema.repos.visible, 1)))
    .get();
}

export function getReleases(repoId: number): Release[] {
  return db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.repoId, repoId))
    .orderBy(desc(schema.releases.publishedAt))
    .all();
}

export function getAssets(releaseId: number): ReleaseAsset[] {
  return db.select().from(schema.releaseAssets).where(eq(schema.releaseAssets.releaseId, releaseId)).all();
}

export function getIssues(repoId: number): Issue[] {
  return db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.repoId, repoId))
    .orderBy(desc(schema.issues.createdAt))
    .all();
}

/** Последние релизы по всем видимым проектам — для блока «Последние обновления». */
export function getLatestUpdates(limit = 5): (Release & { repo: Repo })[] {
  const rows = db
    .select()
    .from(schema.releases)
    .innerJoin(schema.repos, eq(schema.releases.repoId, schema.repos.id))
    .where(eq(schema.repos.visible, 1))
    .orderBy(desc(schema.releases.publishedAt))
    .limit(limit)
    .all();
  return rows.map((row) => ({ ...row.releases, repo: row.repos }));
}

export function getPublishedPosts(): Post[] {
  return db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.createdAt))
    .all();
}

export function getAllPosts(): Post[] {
  return db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt)).all();
}

export function getPost(id: number): Post | undefined {
  return db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
}
