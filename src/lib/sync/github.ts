import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { config } from '../config';
import { renderReadme } from '../markdown';

const API = 'https://api.github.com';

async function gh<T>(path: string, accept = 'application/vnd.github+json'): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'normno-ru-site',
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
  return (accept.includes('raw') ? res.text() : res.json()) as Promise<T>;
}

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
}

interface GhAsset {
  id: number;
  name: string;
  download_count: number;
  browser_download_url: string;
  size: number;
}

interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GhAsset[];
}

interface GhIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  comments: number;
  pull_request?: unknown;
}

/**
 * Полный синк GitHub → SQLite: repos, releases + download_count, stargazers,
 * open issues, README (рендерится в HTML на этапе синка).
 * Сайт НИКОГДА не ходит в GitHub в момент запроса пользователя.
 */
export async function syncGithub(): Promise<{ repos: number }> {
  const user = config.githubUsername;
  if (!user) return { repos: 0 };

  const ghRepos =
    (await gh<GhRepo[]>(`/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`)) ?? [];
  const active = ghRepos.filter((r) => !r.fork && !r.archived);
  const now = new Date().toISOString();

  for (const r of active) {
    // README → HTML
    let readmeHtml = '';
    try {
      const raw = await gh<string>(`/repos/${r.full_name}/readme`, 'application/vnd.github.raw+json');
      if (raw) readmeHtml = renderReadme(raw, r.full_name);
    } catch (e) {
      console.error(`[sync] README ${r.full_name}:`, e);
    }

    // Релизы и ассеты
    let ghReleases: GhRelease[] = [];
    try {
      ghReleases = ((await gh<GhRelease[]>(`/repos/${r.full_name}/releases?per_page=30`)) ?? []).filter(
        (rel) => !rel.draft,
      );
    } catch (e) {
      console.error(`[sync] releases ${r.full_name}:`, e);
    }

    let totalDownloads = 0;
    for (const rel of ghReleases) {
      const relDownloads = rel.assets.reduce((sum, a) => sum + a.download_count, 0);
      totalDownloads += relDownloads;
      db.insert(schema.releases)
        .values({
          id: rel.id,
          repoId: r.id,
          tag: rel.tag_name,
          name: rel.name ?? rel.tag_name,
          notes: (rel.body ?? '').split('\n')[0]?.slice(0, 300) ?? '',
          publishedAt: rel.published_at ?? '',
          downloads: relDownloads,
          htmlUrl: rel.html_url,
        })
        .onConflictDoUpdate({
          target: schema.releases.id,
          set: {
            tag: rel.tag_name,
            name: rel.name ?? rel.tag_name,
            notes: (rel.body ?? '').split('\n')[0]?.slice(0, 300) ?? '',
            publishedAt: rel.published_at ?? '',
            downloads: relDownloads,
            htmlUrl: rel.html_url,
          },
        })
        .run();
      for (const a of rel.assets) {
        db.insert(schema.releaseAssets)
          .values({
            id: a.id,
            releaseId: rel.id,
            name: a.name,
            downloadCount: a.download_count,
            downloadUrl: a.browser_download_url,
            size: a.size,
          })
          .onConflictDoUpdate({
            target: schema.releaseAssets.id,
            set: { name: a.name, downloadCount: a.download_count, downloadUrl: a.browser_download_url, size: a.size },
          })
          .run();
      }
      const keepAssets = rel.assets.map((a) => a.id);
      db.delete(schema.releaseAssets)
        .where(
          keepAssets.length > 0
            ? and(eq(schema.releaseAssets.releaseId, rel.id), notInArray(schema.releaseAssets.id, keepAssets))
            : eq(schema.releaseAssets.releaseId, rel.id),
        )
        .run();
    }
    // Удаляем релизы, которых больше нет
    const keepReleases = ghReleases.map((rel) => rel.id);
    db.delete(schema.releases)
      .where(
        keepReleases.length > 0
          ? and(eq(schema.releases.repoId, r.id), notInArray(schema.releases.id, keepReleases))
          : eq(schema.releases.repoId, r.id),
      )
      .run();

    const latest = ghReleases.find((rel) => !rel.prerelease) ?? ghReleases[0];
    const latestAsset = latest?.assets[0];

    // Открытые issues (без pull request'ов)
    try {
      const ghIssues = ((await gh<GhIssue[]>(`/repos/${r.full_name}/issues?state=open&per_page=30`)) ?? []).filter(
        (i) => !i.pull_request,
      );
      db.delete(schema.issues).where(eq(schema.issues.repoId, r.id)).run();
      for (const i of ghIssues) {
        db.insert(schema.issues)
          .values({
            id: i.id,
            repoId: r.id,
            number: i.number,
            title: i.title,
            htmlUrl: i.html_url,
            createdAt: i.created_at,
            comments: i.comments,
          })
          .onConflictDoNothing()
          .run();
      }
    } catch (e) {
      console.error(`[sync] issues ${r.full_name}:`, e);
    }

    // Репозиторий (visible/category/image_url управляются из админки — не трогаем при апдейте)
    db.insert(schema.repos)
      .values({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        description: r.description ?? '',
        htmlUrl: r.html_url,
        stars: r.stargazers_count,
        totalDownloads,
        imageUrl: '',
        readmeHtml,
        latestTag: latest?.tag_name ?? '',
        latestAssetUrl: latestAsset?.browser_download_url ?? '',
        pushedAt: r.pushed_at,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.repos.id,
        set: {
          name: r.name,
          fullName: r.full_name,
          description: r.description ?? '',
          htmlUrl: r.html_url,
          stars: r.stargazers_count,
          totalDownloads,
          readmeHtml,
          latestTag: latest?.tag_name ?? '',
          latestAssetUrl: latestAsset?.browser_download_url ?? '',
          pushedAt: r.pushed_at,
          syncedAt: now,
        },
      })
      .run();
  }

  // Репозитории, исчезнувшие с GitHub, убираем из БД
  const keepIds = active.map((r) => r.id);
  if (keepIds.length > 0) {
    const gone = db.select({ id: schema.repos.id }).from(schema.repos).where(notInArray(schema.repos.id, keepIds)).all();
    if (gone.length > 0) {
      const goneIds = gone.map((g) => g.id);
      db.delete(schema.repos).where(inArray(schema.repos.id, goneIds)).run();
      db.delete(schema.issues).where(inArray(schema.issues.repoId, goneIds)).run();
      db.delete(schema.releases).where(inArray(schema.releases.repoId, goneIds)).run();
    }
  }

  return { repos: active.length };
}
