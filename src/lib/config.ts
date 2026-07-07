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
  get adminUser() {
    return env('ADMIN_USER', 'admin');
  },
  get adminPass() {
    return env('ADMIN_PASS');
  },
  get dbPath() {
    return env('DB_PATH', './data/site.db');
  },
  get syncIntervalMin() {
    const n = Number.parseInt(env('SYNC_INTERVAL_MIN', '30'), 10);
    return Number.isFinite(n) && n >= 5 ? n : 30;
  },
};
