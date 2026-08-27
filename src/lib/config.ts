/** Централизованный доступ к переменным окружения (.env / docker env_file). */
function env(name: string, fallback = ''): string {
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined;
  const fromVite = (import.meta as { env?: Record<string, string> }).env?.[name];
  return fromProcess ?? fromVite ?? fallback;
}

export const config = {
  get siteUrl() {
    return env('SITE_URL', 'http://localhost:4321');
  },
  /**
   * Хост публичного сайта: SITE_URL без схемы и завершающего слэша.
   * Нужен там, где домен показывается человеку (заголовки, подпись бэкапа)
   * — чтобы адрес задавался только в .env и не был вшит в код.
   */
  get siteHost() {
    const raw = env('SITE_URL', 'http://localhost:4321');
    try {
      return new URL(raw).host;
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  },
  /** Хост, с которого доступна админка (отдельный поддомен). На всех остальных хостах /admin отдаёт 404. */
  get adminHost() {
    return env('ADMIN_HOST', 'admin.localhost');
  },
  get githubUsername() {
    return env('GITHUB_USERNAME', 'NORMss');
  },
  get githubToken() {
    return env('GITHUB_TOKEN');
  },
  get spotifyClientId() {
    return env('SPOTIFY_CLIENT_ID');
  },
  get spotifyClientSecret() {
    return env('SPOTIFY_CLIENT_SECRET');
  },
  get spotifyRefreshToken() {
    return env('SPOTIFY_REFRESH_TOKEN');
  },
  /**
   * Redirect URI для OAuth Spotify. По умолчанию — https://<ADMIN_HOST>/admin/spotify/callback;
   * ровно эта строка должна быть добавлена в настройках приложения на developer.spotify.com.
   */
  get spotifyRedirectUri() {
    return env('SPOTIFY_REDIRECT_URI') || `https://${env('ADMIN_HOST', 'admin.localhost')}/admin/spotify/callback`;
  },
  get telegramBotToken() {
    return env('TELEGRAM_BOT_TOKEN');
  },
  /** Необязательный фильтр: @username канала, посты которого импортируем. */
  get telegramChannel() {
    return env('TELEGRAM_CHANNEL');
  },
  /** Личный chat_id для ежедневных бэкапов (НЕ публичный канал!). Пусто — бэкапы выключены. */
  get telegramBackupChatId() {
    return env('TELEGRAM_BACKUP_CHAT_ID');
  },
  /** Пустой ADMIN_USER в .env — это «не задано», а не логин из пустой строки. */
  get adminUser() {
    return env('ADMIN_USER').trim() || 'admin';
  },
  get adminPass() {
    return env('ADMIN_PASS');
  },
  /**
   * Провайдер автоперевода: google | deepl | azure | none.
   * Пусто — определяется автоматически по заданному ключу.
   */
  get translateProvider() {
    return env('TRANSLATE_PROVIDER').trim().toLowerCase();
  },
  /** Google Cloud Translation API (v2, авторизация по API-ключу). Бесплатно 500 000 символов/мес. */
  get googleTranslateKey() {
    return env('GOOGLE_TRANSLATE_API_KEY').trim();
  },
  /** DeepL API Free — 500 000 символов/мес, у провайдера есть эндпоинт реального расхода. */
  get deeplApiKey() {
    return env('DEEPL_API_KEY').trim();
  },
  /** Azure AI Translator, тариф F0 — 2 000 000 символов/мес. */
  get azureTranslatorKey() {
    return env('AZURE_TRANSLATOR_KEY').trim();
  },
  get azureTranslatorRegion() {
    return env('AZURE_TRANSLATOR_REGION', 'global').trim();
  },
  get azureTranslatorEndpoint() {
    return env('AZURE_TRANSLATOR_ENDPOINT', 'https://api.cognitive.microsofttranslator.com').replace(/\/$/, '');
  },
  /** Свой месячный потолок символов (0 — брать бесплатный лимит провайдера). */
  get translateMonthlyLimit() {
    const n = Number.parseInt(env('TRANSLATE_MONTHLY_LIMIT', '0'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  /** Ключ IndexNow — мгновенное уведомление Bing/Yandex о новых страницах. */
  get indexNowKey() {
    return env('INDEXNOW_KEY').trim();
  },
  /** content= из мета-тега подтверждения прав в Google Search Console. */
  get googleSiteVerification() {
    return env('GOOGLE_SITE_VERIFICATION').trim();
  },
  /** content= из мета-тега подтверждения прав в Яндекс.Вебмастере. */
  get yandexVerification() {
    return env('YANDEX_VERIFICATION').trim();
  },
  get dbPath() {
    return env('DB_PATH', './data/site.db');
  },
  get syncIntervalMin() {
    const n = Number.parseInt(env('SYNC_INTERVAL_MIN', '30'), 10);
    return Number.isFinite(n) && n >= 5 ? n : 30;
  },
};
