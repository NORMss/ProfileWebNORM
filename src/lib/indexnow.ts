import { config } from './config';
import { LOCALES } from './i18n';
import { absoluteUrl } from './seo';

/**
 * IndexNow — мгновенное уведомление поисковиков (Bing, Yandex, Seznam)
 * о новых и изменённых страницах. Google этот протокол не поддерживает,
 * ему остаётся sitemap.xml и Search Console, зато стоит это ноль запросов
 * к платным API и одну строчку после публикации поста.
 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export function indexNowConfigured(): boolean {
  return !!config.indexNowKey && !config.siteUrl.includes('localhost');
}

/** Пингует IndexNow для обеих языковых версий пути. Ошибки только логируются. */
export async function pingIndexNow(paths: string[]): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!indexNowConfigured()) return { ok: false, status: 0, error: 'IndexNow не настроен' };

  const host = new URL(config.siteUrl).host;
  const urlList = paths.flatMap((path) => LOCALES.map((lang) => absoluteUrl(path, lang)));
  if (!urlList.length) return { ok: false, status: 0, error: 'Пустой список URL' };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: config.indexNowKey, keyLocation: `${config.siteUrl.replace(/\/$/, '')}/${config.indexNowKey}.txt`, urlList }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Фоновый пинг: публикация поста не должна ждать ответа поисковика. */
export function pingIndexNowInBackground(paths: string[]): void {
  if (!indexNowConfigured()) return;
  void pingIndexNow(paths).then((r) => {
    if (!r.ok) console.warn('[indexnow] не удалось уведомить:', r.error);
  });
}
