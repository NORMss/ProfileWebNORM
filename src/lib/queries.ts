import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db, schema } from './db';

export type Repo = typeof schema.repos.$inferSelect;
export type Release = typeof schema.releases.$inferSelect;
export type ReleaseAsset = typeof schema.releaseAssets.$inferSelect;
export type Issue = typeof schema.issues.$inferSelect;
export type Post = typeof schema.posts.$inferSelect;

/**
 * Списочные проекции: в таблицах лежат readme_html и body_md/body_html по
 * сотне килобайт на строку, а спискам от них нужны только название, описание
 * и обложка. Раньше `SELECT *` тянул README всех проектов на каждый рендер
 * /projects — это и был основной вклад в время ответа сервера.
 */
export type RepoCard = Pick<
  Repo,
  'id' | 'name' | 'fullName' | 'description' | 'htmlUrl' | 'stars' | 'totalDownloads' | 'category' | 'imageUrl' | 'latestTag' | 'pushedAt'
>;

export type PostCard = Pick<
  Post,
  'id' | 'title' | 'excerpt' | 'bodyHash' | 'source' | 'tgMessageId' | 'coverUrl' | 'coverThumb' | 'createdAt' | 'updatedAt'
>;

const REPO_CARD_COLUMNS = {
  id: schema.repos.id,
  name: schema.repos.name,
  fullName: schema.repos.fullName,
  description: schema.repos.description,
  htmlUrl: schema.repos.htmlUrl,
  stars: schema.repos.stars,
  totalDownloads: schema.repos.totalDownloads,
  category: schema.repos.category,
  imageUrl: schema.repos.imageUrl,
  latestTag: schema.repos.latestTag,
  pushedAt: schema.repos.pushedAt,
} as const;

const POST_CARD_COLUMNS = {
  id: schema.posts.id,
  title: schema.posts.title,
  excerpt: schema.posts.excerpt,
  bodyHash: schema.posts.bodyHash,
  source: schema.posts.source,
  tgMessageId: schema.posts.tgMessageId,
  coverUrl: schema.posts.coverUrl,
  coverThumb: schema.posts.coverThumb,
  createdAt: schema.posts.createdAt,
  updatedAt: schema.posts.updatedAt,
} as const;

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

/** Карточки видимых проектов — без README, для списка /projects и данных для агентов. */
export function getVisibleRepoCards(category?: 'hard' | 'vibe'): RepoCard[] {
  const cond = category
    ? and(eq(schema.repos.visible, 1), eq(schema.repos.category, category))
    : eq(schema.repos.visible, 1);
  return db.select(REPO_CARD_COLUMNS).from(schema.repos).where(cond).orderBy(desc(schema.repos.pushedAt)).all();
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

/** Дата последнего релиза каждого репозитория (repoId → ISO-строка). */
export function getLatestReleaseDates(): Map<number, string> {
  const rows = db
    .select({
      repoId: schema.releases.repoId,
      latest: sql<string>`MAX(${schema.releases.publishedAt})`,
    })
    .from(schema.releases)
    .groupBy(schema.releases.repoId)
    .all();
  return new Map(rows.map((r) => [r.repoId, r.latest ?? '']));
}

export type ProjectsSort = 'released' | 'downloads' | 'stars';

export function normalizeProjectsSort(raw: string): ProjectsSort {
  return raw === 'downloads' || raw === 'stars' ? raw : 'released';
}

/** Сортировка списка проектов; releasedAt — из getLatestReleaseDates, фолбэк pushed_at. */
export function sortRepos<T extends Pick<Repo, 'id' | 'stars' | 'totalDownloads' | 'pushedAt'>>(
  list: T[],
  sort: ProjectsSort,
  releaseDates: Map<number, string>,
): T[] {
  const released = (r: T) => releaseDates.get(r.id) || r.pushedAt;
  return [...list].sort((a, b) => {
    if (sort === 'downloads') return b.totalDownloads - a.totalDownloads;
    if (sort === 'stars') return b.stars - a.stars;
    return released(b).localeCompare(released(a));
  });
}

/** Последние релизы по всем видимым проектам — для блока «Последние обновления». */
export function getLatestUpdates(limit = 5): (Release & { repo: RepoCard })[] {
  const rows = db
    .select({ release: schema.releases, repo: REPO_CARD_COLUMNS })
    .from(schema.releases)
    .innerJoin(schema.repos, eq(schema.releases.repoId, schema.repos.id))
    .where(eq(schema.repos.visible, 1))
    .orderBy(desc(schema.releases.publishedAt))
    .limit(limit)
    .all();
  return rows.map((row) => ({ ...row.release, repo: row.repo }));
}

/** Опубликованные посты целиком — нужны только там, где показывается тело поста. */
export function getPublishedPosts(limit?: number): Post[] {
  const query = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.createdAt));
  return limit === undefined ? query.all() : query.limit(limit).all();
}

/**
 * Карточки опубликованных постов с окном limit/offset — под подгрузку списка
 * публикаций при прокрутке: страница отдаёт первую пачку, остальное берётся
 * тем же запросом из /api/publications.
 */
export function getPublishedPostCards(limit?: number, offset = 0): PostCard[] {
  const query = db
    .select(POST_CARD_COLUMNS)
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.createdAt));
  if (limit === undefined) return offset > 0 ? query.offset(offset).all() : query.all();
  return query.limit(limit).offset(offset).all();
}

/** Сколько всего опубликованных постов — чтобы список знал, есть ли что догружать. */
export function countPublishedPosts(): number {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .get();
  return row?.n ?? 0;
}

/** Поиск по публикациям — для инструментов WebMCP и агентов. */
export function searchPublishedPostCards(query: string, limit = 20): PostCard[] {
  const q = `%${query.trim().toLowerCase()}%`;
  return db
    .select(POST_CARD_COLUMNS)
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.status, 'published'),
        or(like(sql`LOWER(${schema.posts.title})`, q), like(sql`LOWER(${schema.posts.bodyMd})`, q)),
      ),
    )
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)
    .all();
}

export function getAllPosts(): Post[] {
  return db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt)).all();
}

export function getPost(id: number): Post | undefined {
  return db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
}
