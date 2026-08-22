import { config } from '../config';

export type ProviderId = 'google' | 'deepl' | 'azure' | 'none';

/** Тип ошибки определяет реакцию: лимит — ждать до следующего месяца, авторизация — чинить ключ. */
export type TranslateErrorKind = 'quota' | 'auth' | 'rate' | 'network' | 'api' | 'disabled' | 'too_large';

export class TranslateError extends Error {
  readonly kind: TranslateErrorKind;
  readonly status: number;

  constructor(kind: TranslateErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'TranslateError';
    this.kind = kind;
    this.status = status;
  }
}

export interface TranslateOptions {
  from: string;
  to: string;
  /** true — исходник размечен HTML: провайдер должен сохранить теги. */
  html: boolean;
}

export interface RemoteUsage {
  used: number;
  limit: number;
}

export interface TranslateProvider {
  id: ProviderId;
  label: string;
  /** Где смотреть тариф и получить ключ — ссылка выводится в админке. */
  consoleUrl: string;
  /** Бесплатный лимит символов в месяц. */
  freeMonthlyChars: number;
  configured: boolean;
  /** Ограничения одного запроса к API. */
  maxCharsPerRequest: number;
  maxSegmentsPerRequest: number;
  translate(texts: string[], options: TranslateOptions): Promise<string[]>;
  /** Реальный расход из API провайдера (умеет только DeepL); null — считаем локально. */
  remoteUsage?(): Promise<RemoteUsage | null>;
}

/** fetch с таймаутом: висящий запрос к переводчику не должен держать рендер страницы. */
async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new TranslateError('network', `Таймаут запроса к API перевода (${timeoutMs} мс)`);
    }
    throw new TranslateError('network', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const err = (body as { error?: { message?: string; code?: string | number } }).error;
    if (err?.message) return String(err.message);
    const msg = (body as { message?: string }).message;
    if (msg) return String(msg);
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  return fallback;
}

/**
 * Google Cloud Translation v2 — авторизация обычным API-ключом (без OAuth
 * и service-account JSON), поэтому не тянет за собой SDK и лишнюю память.
 * Бесплатно 500 000 символов в месяц на проект, дальше $20 за миллион.
 */
const google: TranslateProvider = {
  id: 'google',
  label: 'Google Cloud Translation',
  consoleUrl: 'https://console.cloud.google.com/apis/api/translate.googleapis.com/quotas',
  freeMonthlyChars: 500_000,
  get configured() {
    return !!config.googleTranslateKey;
  },
  maxCharsPerRequest: 20_000,
  maxSegmentsPerRequest: 64,
  async translate(texts, options) {
    if (!config.googleTranslateKey) throw new TranslateError('auth', 'GOOGLE_TRANSLATE_API_KEY не задан');
    const { status, body } = await fetchJson(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(config.googleTranslateKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: texts,
          source: options.from,
          target: options.to,
          format: options.html ? 'html' : 'text',
        }),
      },
    );

    if (status !== 200) {
      const message = messageOf(body, `Google Translation API → HTTP ${status}`);
      const reasons = JSON.stringify(body ?? '').toLowerCase();
      if (status === 429 || reasons.includes('quotaexceeded') || reasons.includes('ratelimitexceeded')) {
        throw new TranslateError('quota', message, status);
      }
      if (status === 400 && reasons.includes('too large')) throw new TranslateError('too_large', message, status);
      if (status === 401 || status === 403 || reasons.includes('api key not valid')) {
        throw new TranslateError('auth', message, status);
      }
      throw new TranslateError('api', message, status);
    }

    const list = (body as { data?: { translations?: { translatedText?: string }[] } })?.data?.translations;
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new TranslateError('api', 'Google Translation API вернул неожиданный ответ');
    }
    return list.map((item, i) => item.translatedText ?? texts[i]);
  },
};

/** DeepL API Free: 500 000 символов/мес и честный эндпоинт расхода /v2/usage. */
const deepl: TranslateProvider = {
  id: 'deepl',
  label: 'DeepL API',
  consoleUrl: 'https://www.deepl.com/your-account/usage',
  freeMonthlyChars: 500_000,
  get configured() {
    return !!config.deeplApiKey;
  },
  maxCharsPerRequest: 30_000,
  maxSegmentsPerRequest: 50,
  async translate(texts, options) {
    const key = config.deeplApiKey;
    if (!key) throw new TranslateError('auth', 'DEEPL_API_KEY не задан');
    const { status, body } = await fetchJson(`${deeplBase(key)}/v2/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${key}` },
      body: JSON.stringify({
        text: texts,
        source_lang: options.from.toUpperCase(),
        target_lang: options.to.toLowerCase() === 'en' ? 'EN-US' : options.to.toUpperCase(),
        tag_handling: options.html ? 'html' : undefined,
      }),
    });

    if (status !== 200) {
      const message = messageOf(body, `DeepL API → HTTP ${status}`);
      if (status === 456) throw new TranslateError('quota', 'Месячный лимит символов DeepL исчерпан', status);
      if (status === 401 || status === 403) throw new TranslateError('auth', message, status);
      if (status === 429) throw new TranslateError('rate', message, status);
      if (status === 413 || status === 414) throw new TranslateError('too_large', message, status);
      throw new TranslateError('api', message, status);
    }

    const list = (body as { translations?: { text?: string }[] })?.translations;
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new TranslateError('api', 'DeepL API вернул неожиданный ответ');
    }
    return list.map((item, i) => item.text ?? texts[i]);
  },
  async remoteUsage() {
    const key = config.deeplApiKey;
    if (!key) return null;
    const { status, body } = await fetchJson(
      `${deeplBase(key)}/v2/usage`,
      { method: 'GET', headers: { Authorization: `DeepL-Auth-Key ${key}` } },
      8_000,
    );
    if (status !== 200) return null;
    const data = body as { character_count?: number; character_limit?: number };
    if (typeof data?.character_count !== 'number') return null;
    return { used: data.character_count, limit: data.character_limit ?? 500_000 };
  },
};

/** Ключи бесплатного тарифа DeepL оканчиваются на :fx и ходят на отдельный хост. */
function deeplBase(key: string): string {
  return key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

/** Azure AI Translator, тариф F0: 2 000 000 символов в месяц бесплатно и без перехода на платный. */
const azure: TranslateProvider = {
  id: 'azure',
  label: 'Azure AI Translator',
  consoleUrl: 'https://portal.azure.com/#blade/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/Translator',
  freeMonthlyChars: 2_000_000,
  get configured() {
    return !!config.azureTranslatorKey;
  },
  maxCharsPerRequest: 45_000,
  maxSegmentsPerRequest: 100,
  async translate(texts, options) {
    const key = config.azureTranslatorKey;
    if (!key) throw new TranslateError('auth', 'AZURE_TRANSLATOR_KEY не задан');
    const params = new URLSearchParams({
      'api-version': '3.0',
      from: options.from,
      to: options.to,
      textType: options.html ? 'html' : 'plain',
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    };
    if (config.azureTranslatorRegion) headers['Ocp-Apim-Subscription-Region'] = config.azureTranslatorRegion;

    const { status, body } = await fetchJson(`${config.azureTranslatorEndpoint}/translate?${params}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(texts.map((Text) => ({ Text }))),
    });

    if (status !== 200) {
      const message = messageOf(body, `Azure Translator → HTTP ${status}`);
      const code = String((body as { error?: { code?: string | number } })?.error?.code ?? '');
      if (status === 403 || code.startsWith('403')) throw new TranslateError('quota', message, status);
      if (status === 401) throw new TranslateError('auth', message, status);
      if (status === 429) throw new TranslateError('rate', message, status);
      if (status === 413) throw new TranslateError('too_large', message, status);
      throw new TranslateError('api', message, status);
    }

    const list = body as { translations?: { text?: string }[] }[];
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new TranslateError('api', 'Azure Translator вернул неожиданный ответ');
    }
    return list.map((item, i) => item.translations?.[0]?.text ?? texts[i]);
  },
};

const disabled: TranslateProvider = {
  id: 'none',
  label: 'Перевод выключен',
  consoleUrl: '',
  freeMonthlyChars: 0,
  configured: false,
  maxCharsPerRequest: 0,
  maxSegmentsPerRequest: 0,
  async translate() {
    throw new TranslateError('disabled', 'Провайдер перевода не настроен');
  },
};

const PROVIDERS: Record<ProviderId, TranslateProvider> = { google, deepl, azure, none: disabled };

/** Список всех провайдеров — для выпадающего списка и справки в админке. */
export function allProviders(): TranslateProvider[] {
  return [google, deepl, azure];
}

/**
 * Активный провайдер: TRANSLATE_PROVIDER, а если он не задан — первый,
 * для которого есть ключ (порядок: Google → DeepL → Azure).
 */
export function activeProvider(): TranslateProvider {
  const forced = config.translateProvider;
  if (forced && forced in PROVIDERS) {
    return PROVIDERS[forced as ProviderId];
  }
  return allProviders().find((p) => p.configured) ?? disabled;
}

/** Месячный потолок символов: свой из .env или бесплатный лимит провайдера. */
export function monthlyLimit(provider: TranslateProvider): number {
  return config.translateMonthlyLimit || provider.freeMonthlyChars;
}
