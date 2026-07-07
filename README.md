# normno.ru — сайт-портфолио

Production-сайт-портфолио с liquid-glass эстетикой: анимированные blob-фоны,
backdrop-blur стекло, ripple-эффект на кликабельных элементах. Тёмная и светлая
темы переключаются автоматически по теме устройства (`prefers-color-scheme`).
В навигации — фирменный смайл; клик по нему запускает анимацию моргания (пасхалка).

**Стек:** Astro + Svelte-островки · Node 22 · SQLite (Drizzle ORM) · Caddy · Docker Compose.
Рассчитан на слабый VPS (512 МБ RAM): всё максимально статично и кешировано, один процесс,
сайт **никогда** не ходит в GitHub/Telegram в момент запроса пользователя.

## Возможности

- **Главная** — блок «обо мне» (текст в **Markdown** и ссылки редактируются в админке,
  фото загружается там же), последние 5 релизов по всем проектам, виджет Spotify
  (текущий трек; если ничего не играет — последний прослушанный).
- **Проекты** — вкладки Hard Code / Vibe Code (принадлежность задаётся в админке); карточка:
  og-image репозитория, название, описание, звёзды, суммарные загрузки. Страница проекта:
  отрендеренный README, релизы с датами и загрузками каждого asset, кнопка «Скачать последнюю
  версию», список открытых issues.
- **Публикации** — markdown-посты из админки и импортированные из Telegram-канала,
  бейдж источника, сортировка по дате. Посты сайта можно публиковать и в
  Telegram-канал (галочка при создании или кнопка «📨» у существующего поста) —
  лента сайта и канала синхронизируется в обе стороны, без дублей.
  Подробно про бота: [docs/TELEGRAM.md](docs/TELEGRAM.md).
- **Обложки проектов** — по умолчанию og-image GitHub; в админке можно выбрать
  картинку из README репозитория (хранится только URL) или загрузить свою
  (только в этом случае файл лежит на сервере, в `data/uploads`).
- **RSS** — лента публикаций на `/rss.xml`.
- **Тепловая карта GitHub** — контрибуции за год на главной (нужен `GITHUB_TOKEN`,
  данные обновляются при синке).
- **Бэкапы в Telegram** — ежедневно в 04:30 бот присылает архив БД и загруженных
  файлов в личный чат (`TELEGRAM_BACKUP_CHAT_ID`), плюс кнопка ручного бэкапа
  в админке. Подробности: [docs/TELEGRAM.md](docs/TELEGRAM.md).
- **Синк данных** — cron внутри приложения (по умолчанию раз в 30 минут) тянет GitHub REST API
  (repos, releases + download_count, stargazers, issues, README) и посты Telegram-канала
  (Bot API getUpdates) и пишет в SQLite. README рендерится `markdown-it` + `sanitize-html`
  на этапе синка.
- **Админка** — вкладки «Проекты GitHub» (показать/скрыть, Hard/Vibe, «Синхронизировать сейчас»),
  «Обо мне и ссылки» (markdown-текст с превью + загрузка фото на главную),
  «Публикации» (markdown-редактор с превью, публикация/черновик/удаление,
  «Парсить посты из Telegram»). Загруженные файлы лежат в `data/uploads`
  (тот же volume, что и БД — попадают в бэкап).

## Безопасность админки: отдельный поддомен

Админка **скрыта от посетителей сайта**:

1. `/admin*` отвечает **404** на основном домене — и в приложении (middleware проверяет `Host`),
   и в Caddy (запросы к `/admin*` на основном домене вообще не проксируются);
2. админка открывается только с поддомена из `ADMIN_HOST` (например `admin.normno.ru`)
   и закрыта **Basic Auth** (`ADMIN_USER` / `ADMIN_PASS` из `.env`);
3. в публичной навигации ссылки на админку нет, `robots.txt` и `X-Robots-Tag` запрещают индексацию.

## Локальная разработка

```bash
npm install
cp .env.example .env   # заполнить минимум ADMIN_PASS; токены — по мере надобности
npm run dev
```

- Сайт: http://localhost:4321
- Админка: http://admin.localhost:4321/admin (в dev `ADMIN_HOST=admin.localhost`;
  браузеры сами резолвят `*.localhost` в 127.0.0.1)

Первый синк с GitHub запускается автоматически через несколько секунд после старта
(или кнопкой «Синхронизировать с GitHub» в админке).

## Деплой на VPS (Docker Compose)

1. Направьте DNS **A-записи** `normno.ru` и `admin.normno.ru` на IP сервера.
2. Установите Docker + Compose-plugin (`curl -fsSL https://get.docker.com | sh`).
3. Склонируйте репозиторий и подготовьте окружение:

   ```bash
   git clone https://github.com/NORMss/ProfileWebNORM.git
   cd ProfileWebNORM
   cp .env.example .env
   nano .env   # SITE_DOMAIN, ADMIN_DOMAIN, ADMIN_HOST, ADMIN_PASS, токены
   ```

4. Запуск:

   ```bash
   docker compose up -d --build
   ```

   Caddy сам выпустит HTTPS-сертификаты Let's Encrypt для обоих доменов.

5. Обновление:

   ```bash
   git pull && docker compose up -d --build
   ```

База лежит в `./data/site.db` — **бэкап = копия одного файла**
(`sqlite3 data/site.db ".backup backup.db"` или просто `cp` при остановленном приложении).

## Переменные окружения

| Переменная | Описание |
| --- | --- |
| `SITE_URL` | Публичный адрес сайта (для ссылок) |
| `SITE_DOMAIN` / `ADMIN_DOMAIN` | Домены для Caddy |
| `ADMIN_HOST` | Хост админки; на других хостах `/admin` → 404 |
| `ADMIN_USER` / `ADMIN_PASS` | Basic Auth админки (без пароля админка отключена) |
| `GITHUB_USERNAME` | Чьи репозитории показывать |
| `GITHUB_TOKEN` | PAT для повышения лимитов GitHub API (опционально, но рекомендуется) |
| `SPOTIFY_CLIENT_ID/SECRET/REFRESH_TOKEN` | Виджет Spotify (без них виджет скрыт) |
| `TELEGRAM_BOT_TOKEN` | Бот для импорта и публикации постов канала (бот — админ канала, см. docs/TELEGRAM.md) |
| `TELEGRAM_CHANNEL` | `@username` канала (или `-100…`); нужен для публикации постов сайта в канал |
| `TELEGRAM_BACKUP_CHAT_ID` | Личный chat_id для ежедневных бэкапов (пусто — выключено) |
| `DB_PATH` | Путь к файлу SQLite |
| `SYNC_INTERVAL_MIN` | Период синка, минут (по умолчанию 30) |

### Как получить refresh token Spotify

1. Создайте приложение на https://developer.spotify.com/dashboard, добавьте redirect URI
   `http://127.0.0.1:8888/callback`.
2. Откройте в браузере (подставьте свой client_id):

   ```
   https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://127.0.0.1:8888/callback&scope=user-read-currently-playing%20user-read-recently-played
   ```

3. Скопируйте `code` из адресной строки и обменяйте на токены:

   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -u "CLIENT_ID:CLIENT_SECRET" \
     -d grant_type=authorization_code -d code=CODE \
     -d redirect_uri=http://127.0.0.1:8888/callback
   ```

   `refresh_token` из ответа → в `.env`.

## Структура

```
src/
  middleware.ts        # host-gating админки + Basic Auth + запуск cron
  lib/
    config.ts          # доступ к env
    db/                # better-sqlite3 + Drizzle, DDL, дефолты
    sync/              # github.ts, telegram.ts, планировщик
    spotify.ts         # now-playing с кешем 30 с
    markdown.ts        # markdown-it + sanitize-html
  pages/               # публичные страницы, /api/now-playing, /admin/**
  components/          # SpotifyWidget.svelte, admin/AdminApp.svelte
deploy/Caddyfile       # два домена: сайт и админка
```
