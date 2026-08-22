# normno.com — сайт-портфолио

Production-сайт-портфолио с liquid-glass эстетикой: анимированные blob-фоны,
backdrop-blur стекло, ripple-эффект на кликабельных элементах. Тёмная и светлая
темы переключаются автоматически по теме устройства (`prefers-color-scheme`).
В навигации — фирменный смайл; клик по нему запускает анимацию моргания (пасхалка).
<img width="1192" height="931" alt="Screenshot 2026-08-14 at 01 21 09" src="https://github.com/user-attachments/assets/67235b19-f2a1-408e-b7c2-e96ad2779937" />

**Стек:** Astro + Svelte-островки · Node 22 · SQLite (Drizzle ORM) · Caddy · Docker Compose.
Рассчитан на слабый VPS (512 МБ RAM): всё максимально статично и кешировано, один процесс,
сайт **никогда** не ходит в GitHub/Telegram в момент запроса пользователя.

## Возможности

- **Главная** — блок «обо мне» (текст в **Markdown** и ссылки редактируются в админке,
  фото загружается там же), минималистичные кнопки соцсетей, последние 3 релиза
  по всем проектам, виджет Spotify (текущий трек; если ничего не играет — последний
  прослушанный), последние 3 публикации и **тепловая карта активности**
  с переключателем GitHub / Claude ✨.
- **Проекты** — вкладки Hard Code / Vibe Code, **поиск** и **сортировка** (новые релизы,
  загрузки, звёзды; вариант по умолчанию задаётся в админке). Карточка: обложка,
  название, описание, звёзды, суммарные загрузки. Страница проекта: отрендеренный
  README, релизы с датами и загрузками каждого asset, список открытых issues.
- **Меню загрузки** — «Скачать последнюю версию» и кнопка у каждого релиза
  раскрывают список файлов: иконка платформы по расширению (Windows, macOS, Linux,
  Android, iOS, Java, архив), размер и число загрузок. Файл под ОС посетителя
  поднимается наверх и помечается «для вашей ОС». Если файл один — обычная ссылка.
- **Публикации** — markdown-посты с картинками из админки и импортированные из
  Telegram-канала (вместе с фото и альбомами), бейдж источника, сортировка по дате.
  Посты сайта публикуются и в канал (rich-markdown, Bot API 10.1), правки
  синхронизируются в обе стороны без дублей; у синхронизированных постов — синий
  самолёт и ссылка на пост канала. Подробно: [docs/TELEGRAM.md](docs/TELEGRAM.md).
- **Обложки проектов** — по умолчанию og-image GitHub; в админке можно выбрать
  картинку из README репозитория (хранится только URL) или загрузить свою
  (только в этом случае файл лежит на сервере, в `data/uploads`).
- **RSS** — лента публикаций на `/rss.xml` (+ автообнаружение в `<head>`).
- **Бэкапы в Telegram** — ежедневно в 04:30 бот присылает архив БД и загруженных
  файлов в личный чат (`TELEGRAM_BACKUP_CHAT_ID`), плюс кнопка ручного бэкапа
  в админке.
- **Две языковые версии** — русская на «чистых» адресах, английская под `/en`
  (`/en/publications/12`). Язык подбирается по `Accept-Language`: браузер не на
  русском — открывается английская версия; выбор гостя запоминается в куки, а
  круглая кнопка в углу переключает язык на той же странице. Роботов по языку
  не редиректим — каждый получает ровно тот URL, что запросил.
- **Автоперевод через API** — интерфейс переведён вручную (лимит не тратится),
  контент — Google Cloud Translation (или DeepL / Azure на выбор) с кешем в
  SQLite. Новые посты переводятся сразу после публикации, старые страницы —
  лениво при первом заходе. README, который и так на английском, определяется
  по доле кириллицы и не переводится вовсе. Локально ничего не крутится:
  для 2 ГБ ОЗУ это единственный рабочий вариант. Подробно:
  [docs/TRANSLATE.md](docs/TRANSLATE.md).
- **SEO** — canonical и `hreflang` на каждой странице, `sitemap.xml` с обеими
  языковыми версиями, динамический `robots.txt` (на админ-хосте — полный
  запрет), Open Graph и Twitter Card, JSON-LD (`Person`, `WebSite`,
  `BlogPosting`, `SoftwareSourceCode`, хлебные крошки), RSS на двух языках и
  IndexNow-пинг Bing/Яндекса при публикации. Чек-лист переезда на новый домен:
  [docs/SEO.md](docs/SEO.md).
- **Синк данных** — cron внутри приложения (по умолчанию раз в 30 минут) тянет GitHub
  (repos, releases + download_count, stargazers, issues, README, календарь контрибуций,
  коммиты с участием Claude) и посты Telegram-канала и пишет в SQLite. README и посты
  рендерятся `markdown-it` + `sanitize-html` на этапе синка — сайт **никогда** не ходит
  во внешние API в момент запроса пользователя.
- **Админка** — вкладки «Проекты GitHub» (видимость, Hard/Vibe, обложки, сортировка
  по умолчанию, ручной синк), «Обо мне и ссылки» (markdown с превью, фото, подключение
  Spotify), «Публикации» (редактор с превью и фото, отправка в Telegram, импорт,
  массовое удаление чекбоксами, диагностика бота, ручной бэкап) и «Переводы»
  (активный провайдер, расход месячного лимита символов с прогресс-баром,
  сравнение бесплатных лимитов сервисов, разбор ошибок API, статус перевода
  каждого поста и ручной перевод). Загруженные файлы — в `data/uploads`,
  том же volume, что и БД.

## Безопасность админки: отдельный поддомен

Админка **скрыта от посетителей сайта**:

1. `/admin*` отвечает **404** на основном домене — и в приложении (middleware проверяет `Host`),
   и в Caddy (запросы к `/admin*` на основном домене вообще не проксируются);
2. админка открывается только с поддомена из `ADMIN_HOST` (например `admin.normno.com`)
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

Полное руководство — **[docs/DEPLOY.md](docs/DEPLOY.md)**: подключение интеграций,
бэкапы и восстановление, обновление, разбор типичных проблем. Кратко:

1. Направьте DNS **A-записи** `normno.com` и `admin.normno.com` на IP сервера.
2. Установите Docker (`curl -fsSL https://get.docker.com | sh`), освободите порты 80/443.
3. Разверните:

   ```bash
   git clone https://github.com/NORMss/ProfileWebNORM.git
   cd ProfileWebNORM
   cp .env.example .env
   nano .env   # SITE_DOMAIN, ADMIN_DOMAIN, ADMIN_HOST, ADMIN_PASS, TZ, токены
   docker compose up -d --build
   ```

   Caddy сам выпустит HTTPS-сертификаты Let's Encrypt для обоих доменов.

4. Обновление: `git pull && docker compose up -d --build`
   (миграции схемы применяются автоматически, данные сохраняются).

Всё состояние сайта — в `./data`: `site.db` (SQLite) и `uploads/` (фото профиля,
обложки, картинки постов). Бэкап = архив этого каталога; при заданном
`TELEGRAM_BACKUP_CHAT_ID` бот присылает его сам каждый день.

## Переменные окружения

| Переменная | Описание |
| --- | --- |
| `SITE_URL` | Публичный адрес сайта (для ссылок) |
| `SITE_DOMAIN` / `ADMIN_DOMAIN` | Домены для Caddy |
| `ALIAS_DOMAINS` | Дополнительные домены через пробел: свой сертификат у каждого, 301 на `SITE_DOMAIN` ([DEPLOY 2.1](docs/DEPLOY.md#21-дополнительные-домены-алиасы)) |
| `ADMIN_HOST` | Хост админки; на других хостах `/admin` → 404 |
| `ADMIN_USER` / `ADMIN_PASS` | Basic Auth админки (без пароля админка отключена) |
| `GITHUB_USERNAME` | Чьи репозитории показывать |
| `GITHUB_TOKEN` | Classic PAT со scope `public_repo` + `read:user`: лимиты API и тепловая карта |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Приложение Spotify (без них виджет скрыт) |
| `SPOTIFY_REFRESH_TOKEN` | Необязательно: токен, полученный вручную (приоритетнее подключения из админки) |
| `SPOTIFY_REDIRECT_URI` | Необязательно: переопределить redirect URI (для локальной разработки) |
| `TELEGRAM_BOT_TOKEN` | Бот для импорта и публикации постов канала (бот — админ канала, см. docs/TELEGRAM.md) |
| `TELEGRAM_CHANNEL` | `@username` канала (или `-100…`); нужен для публикации постов сайта в канал |
| `TELEGRAM_BACKUP_CHAT_ID` | Личный chat_id для ежедневных бэкапов (пусто — выключено) |
| `TRANSLATE_PROVIDER` | Провайдер автоперевода: `google` / `deepl` / `azure` / `none` (пусто — первый с ключом) |
| `GOOGLE_TRANSLATE_API_KEY` | Ключ Google Cloud Translation API (бесплатно 500 000 символов/мес) |
| `DEEPL_API_KEY` / `AZURE_TRANSLATOR_KEY` | Альтернативные переводчики, см. [docs/TRANSLATE.md](docs/TRANSLATE.md) |
| `TRANSLATE_MONTHLY_LIMIT` | Свой потолок символов в месяц (0 — бесплатный лимит провайдера) |
| `INDEXNOW_KEY` | Ключ IndexNow: сайт сам сообщает Bing и Яндексу о новых постах |
| `GOOGLE_SITE_VERIFICATION` / `YANDEX_VERIFICATION` | `content=` мета-тегов подтверждения прав в Search Console и Вебмастере |
| `DB_PATH` | Путь к файлу SQLite |
| `SYNC_INTERVAL_MIN` | Период синка, минут (по умолчанию 30) |
| `TZ` | Часовой пояс контейнера — от него зависит время ежедневного бэкапа (04:30) |

### Как подключить Spotify

Всё делается из браузера (в том числе с телефона), терминал не нужен:

1. Создайте приложение на https://developer.spotify.com/dashboard.
2. В его настройках добавьте **Redirect URI** — адрес админки:
   `https://admin.normno.com/admin/spotify/callback`
   (подставьте свой `ADMIN_DOMAIN`; точное значение показано в админке).
3. Впишите `SPOTIFY_CLIENT_ID` и `SPOTIFY_CLIENT_SECRET` в `.env`,
   перезапустите: `docker compose up -d --build`.
4. Откройте админку → вкладка «Обо мне и ссылки» → **«♫ Подключить Spotify»**
   → подтвердите доступ. Refresh token сохранится в БД автоматически,
   `SPOTIFY_REFRESH_TOKEN` в `.env` заполнять не нужно.

Spotify принимает только HTTPS-адреса и loopback (`127.0.0.1`) — поэтому
redirect ведёт на домен админки, где уже настроен HTTPS от Caddy.
Для локальной разработки задайте `SPOTIFY_REDIRECT_URI=http://127.0.0.1:4321/admin/spotify/callback`
и добавьте тот же адрес в приложение Spotify.

<details>
<summary>Ручной способ (если нужен токен в .env)</summary>

Откройте в браузере (подставьте свой client_id и redirect_uri из приложения),
подтвердите доступ, скопируйте `code` из адресной строки — страница при этом
может показать ошибку, это нормально:

```
https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=REDIRECT_URI&scope=user-read-currently-playing%20user-read-recently-played
```

```bash
curl -X POST https://accounts.spotify.com/api/token \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d grant_type=authorization_code -d code=CODE \
  -d redirect_uri=REDIRECT_URI
```

`refresh_token` из ответа → в `.env` как `SPOTIFY_REFRESH_TOKEN`
(значение из `.env` имеет приоритет над полученным через админку).
</details>

## Структура

```
src/
  middleware.ts        # host-gating админки + Basic Auth + CSRF + языковой
                       # роутинг (/en, Accept-Language, куки) + запуск cron
  lib/
    config.ts          # доступ к env
    db/                # better-sqlite3 + Drizzle, DDL, миграции, дефолты
    sync/              # github.ts (репозитории, контрибуции, Claude-коммиты),
                       # telegram.ts (импорт постов и фото), планировщик
    telegram.ts        # публикация и правка постов в канале (rich-markdown)
    backup.ts          # снапшот БД + uploads → архив в Telegram
    spotify.ts         # now-playing с кешем 30 с
    markdown.ts        # markdown-it + sanitize-html
    i18n/              # языки, разбор Accept-Language, словарь строк интерфейса
    translate/         # провайдеры API, кеш переводов в SQLite, учёт лимита
    seo.ts             # canonical, hreflang, Open Graph, JSON-LD
    indexnow.ts        # пинг Bing/Яндекса при публикации
  pages/
    index/projects/publications   # публичные страницы
    rss.xml.ts                    # RSS-лента (на языке версии сайта)
    sitemap.xml.ts                # карта сайта с hreflang-альтернативами
    robots.txt.ts                 # robots: публичный хост и админ-хост по-разному
    [key].txt.ts                  # файл-подтверждение ключа IndexNow
    api/now-playing.ts            # JSON для виджета
    media/**                      # отдача загруженных изображений
    admin/**                      # админка, её API и OAuth Spotify
  components/          # Icon, Heatmap, SpotifyWidget, admin/AdminApp
docs/DEPLOY.md         # руководство по развертыванию
docs/TELEGRAM.md       # бот: посты, синхронизация, бэкапы
docs/TRANSLATE.md      # автоперевод: выбор API, лимиты, кеш, ошибки
docs/SEO.md            # индексация, hreflang, переезд на новый домен
deploy/Caddyfile       # домены: сайт, админка, алиасы с 301
deploy/local/          # свои блоки Caddy для этого сервера (не в git)
```
