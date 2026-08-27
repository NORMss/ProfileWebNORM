import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { config } from '../config';
import { renderReadme } from '../markdown';
import { setSetting } from '../settings';

const API = 'https://api.github.com';

async function gh<T>(path: string, accept = 'application/vnd.github+json'): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'profile-site',
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
 * Тепловая карта контрибуций (как на GitHub-профиле) через GraphQL.
 * Требует GITHUB_TOKEN; результат кладётся в settings → gh_contributions.
 */
async function syncContributions(): Promise<void> {
  if (!config.githubToken) return;
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-site',
    },
    body: JSON.stringify({ query, variables: { login: config.githubUsername } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL → ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      user?: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number;
            weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
          };
        };
      };
    };
    errors?: { message: string }[];
  };
  const calendar = data.data?.user?.contributionsCollection.contributionCalendar;
  if (!calendar) throw new Error(`GitHub GraphQL: ${data.errors?.[0]?.message ?? 'нет данных'}`);
  // Массив недель, в каждой до 7 пар [дата, число] — компактно для settings
  const weeks = calendar.weeks.map((w) => w.contributionDays.map((d) => [d.date, d.contributionCount] as const));
  setSetting('gh_contributions', JSON.stringify({ total: calendar.totalContributions, weeks }));
}

interface GhCommit {
  commit?: { message?: string; author?: { email?: string; date?: string } };
  author?: { login?: string } | null;
}

/** Коммит сделан с участием Claude (vibe-code): trailer Co-Authored-By, автор-бот или почта Anthropic. */
function isClaudeCommit(c: GhCommit): boolean {
  const message = c.commit?.message ?? '';
  const email = c.commit?.author?.email ?? '';
  const login = c.author?.login ?? '';
  return /co-authored-by:[^\n]*claude/i.test(message) || /claude/i.test(login) || /@anthropic\.com$/i.test(email);
}

/**
 * «Активность из Claude»: сколько коммитов за последний год сделано вместе
 * с Claude. Сканируются коммиты всех репозиториев (до 300 на репозиторий);
 * результат — settings → claude_contributions {total, byDate}.
 */
async function syncClaudeActivity(fullNames: string[]): Promise<void> {
  const since = new Date(Date.now() - 366 * 86_400_000).toISOString();
  const byDate: Record<string, number> = {};
  let total = 0;
  for (const full of fullNames) {
    for (let page = 1; page <= 3; page++) {
      let commits: GhCommit[] | null = null;
      try {
        commits = await gh<GhCommit[]>(`/repos/${full}/commits?since=${since}&per_page=100&page=${page}`);
      } catch {
        break; // пустой репозиторий отвечает 409 — просто пропускаем
      }
      if (!commits || commits.length === 0) break;
      for (const c of commits) {
        if (!isClaudeCommit(c)) continue;
        const date = (c.commit?.author?.date ?? '').slice(0, 10);
        if (!date) continue;
        byDate[date] = (byDate[date] ?? 0) + 1;
        total++;
      }
      if (commits.length < 100) break;
    }
  }
  setSetting('claude_contributions', JSON.stringify({ total, byDate }));
}

/** URL картинок из отрендеренного README — кандидаты в обложку проекта. */
function extractReadmeImages(readmeHtml: string, limit = 12): string[] {
  const urls = new Set<string>();
  for (const m of readmeHtml.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const url = m[1];
    if (/^https?:\/\//i.test(url) && !/\.svg(\?|$)/i.test(url)) urls.add(url);
    if (urls.size >= limit) break;
  }
  return [...urls];
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

    // Репозиторий (visible/category/image_url/cover_file управляются из админки — не трогаем при апдейте)
    const readmeImages = JSON.stringify(extractReadmeImages(readmeHtml));
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
        readmeImages,
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
          readmeImages,
          readmeHtml,
          latestTag: latest?.tag_name ?? '',
          latestAssetUrl: latestAsset?.browser_download_url ?? '',
          pushedAt: r.pushed_at,
          syncedAt: now,
        },
      })
      .run();
  }

  // Репозитории, исчезнувшие с GitHub, убираем из БД (вместе с файлами обложек)
  const keepIds = active.map((r) => r.id);
  if (keepIds.length > 0) {
    const gone = db
      .select({ id: schema.repos.id, coverFile: schema.repos.coverFile })
      .from(schema.repos)
      .where(notInArray(schema.repos.id, keepIds))
      .all();
    if (gone.length > 0) {
      const fs = await import('node:fs');
      for (const g of gone) {
        if (g.coverFile && fs.existsSync(g.coverFile)) fs.unlinkSync(g.coverFile);
      }
      const goneIds = gone.map((g) => g.id);
      db.delete(schema.repos).where(inArray(schema.repos.id, goneIds)).run();
      db.delete(schema.issues).where(inArray(schema.issues.repoId, goneIds)).run();
      db.delete(schema.releases).where(inArray(schema.releases.repoId, goneIds)).run();
    }
  }

  try {
    await syncContributions();
  } catch (e) {
    console.error('[sync] contributions:', e);
  }
  try {
    await syncClaudeActivity(active.map((r) => r.full_name));
  } catch (e) {
    console.error('[sync] claude activity:', e);
  }

  return { repos: active.length };
}
