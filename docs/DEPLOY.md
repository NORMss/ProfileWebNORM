# Деплой сайта на VPS

Пошаговое руководство: от чистого сервера до работающего сайта со всеми
интеграциями (GitHub, Telegram, Spotify, бэкапы).

Минимальные требования: 1 vCPU / 512 МБ RAM / 10 ГБ диска.
В работе — два контейнера: `app` (Node 22, ~120 МБ RAM) и `caddy` (~20 МБ).

---

## 1. Что понадобится

| Обязательно | Опционально (можно добавить позже) |
| --- | --- |
| VPS с Docker | GitHub PAT — лимиты API и тепловая карта |
| Два домена: `example.com` и `admin.example.com` | Telegram-бот — импорт/публикация постов, бэкапы |
| Пароль для админки | Spotify-приложение — виджет «сейчас играет» |

Без опциональных ключей сайт работает: проекты тянутся из публичного API
GitHub, виджет Spotify и тепловая карта просто не показываются.

## 2. DNS

Заведите две **A-записи** на IP сервера:

```
example.com        A    203.0.113.10
admin.example.com  A    203.0.113.10
```

Проверка: `dig +short example.com` и `dig +short admin.example.com` должны
вернуть IP сервера. Поддомен админки нужен обязательно — на основном домене
`/admin` отдаёт 404 (см. [раздел 8](#8-безопасность)).

Каждый домен и поддомен — **отдельная A-запись**: wildcard `*.example.com`
по умолчанию никто не заводит, а без записи браузер отдаст
`ERR_NAME_NOT_RESOLVED` ещё до того, как запрос дойдёт до сервера.

Дополнительные домены (старый `example.ru`, `www`) — см. [2.1](#21-дополнительные-домены-алиасы).

### 2.1. Дополнительные домены (алиасы)

Любой домен, кроме основного, добавляется одной переменной — сертификат Caddy
выпустит сам, ничего вручную запрашивать не нужно.

1. **A-записи** каждого домена → тот же IP сервера:

   ```
   example.ru        A    203.0.113.10
   www.example.com   A    203.0.113.10
   ```

   Дождитесь обновления DNS: `dig +short example.ru @1.1.1.1` должен вернуть IP
   сервера. Пока запись не резолвится (или ведёт на старый хостинг), Let's Encrypt
   не подтвердит владение доменом, и в логах caddy будет бесконечный ретрай ACME.

2. В `.env` перечислите домены через пробел:

   ```env
   ALIAS_DOMAINS=example.ru www.example.ru www.example.com
   ```

3. Примените конфиг:

   ```bash
   docker compose up -d          # пересоздаст только caddy
   docker compose logs caddy | grep -i "certificate obtained"
   curl -sI https://example.ru | head -1     # HTTP/2 301
   ```

Домены из `ALIAS_DOMAINS` отдают **301** на канонический `SITE_DOMAIN` с
сохранением пути и query: у страниц остаётся один адрес для поиска и ссылок,
а сертификат есть у каждого домена (без него браузер покажет предупреждение
ещё до редиректа).

`ALIAS_DOMAINS` работает только с перечисленными в нём хостами. Поддомены,
занятые другими приложениями (`app.example.ru`), вписывать в него нельзя —
они уедут в редирект на сайт; для них — [раздел 2.2](#22-другое-приложение-на-этом-же-сервере).

**Смена основного домена.** Поменяйте местами значения и обновите адреса,
которые уходят наружу:

```env
SITE_URL=https://example.com
SITE_DOMAIN=example.com
ALIAS_DOMAINS=example.ru www.example.ru www.example.com
ADMIN_DOMAIN=admin.example.com
ADMIN_HOST=admin.example.com
```

`ADMIN_HOST` обязан совпадать с `ADMIN_DOMAIN`: Caddy проксирует админку по
первому, приложение сверяет `Host` со вторым — при расхождении админка отдаст
404. Тогда же: A-запись `admin.example.com`, новый Redirect URI
`https://admin.example.com/admin/spotify/callback` в приложении Spotify (старый
можно удалить после проверки) и `docker compose up -d` — `SITE_URL`
подставляется в RSS и в ссылки постов, публикуемых в Telegram. Пересборка не
нужна: значения читаются из окружения в рантайме.

Старые A-записи после переезда **не удаляйте** — на них держится 301 для
внешних ссылок и поисковой выдачи.

### 2.2. Другое приложение на этом же сервере

Порты 80/443 занимает один Caddy — тот, что поднят этим compose-проектом.
Второй reverse-proxy рядом не поднимется, поэтому соседние приложения
обслуживает этот же контейнер: свои блоки кладутся в `deploy/local/*.caddy`
(каталог не в git, подключается через `import`), а сеть добавляется в
`docker-compose.override.yml` (тоже не в git, compose подхватывает его сам).

```yaml
# docker-compose.override.yml
services:
  caddy:
    networks:
      - default              # обязательно: иначе caddy потеряет сам сайт
      - othernet

networks:
  othernet:
    external: true
    name: <сеть чужого проекта>      # docker ps → колонка NETWORKS
```

```caddy
# deploy/local/app.caddy
app.example.com {
	reverse_proxy <имя_контейнера>:8000
}

app.example.ru {
	redir https://app.example.com{uri} permanent
}
```

⚠️ Апстрим указывайте **именем контейнера** (`docker ps`, например
`myapp-app-1`), а не именем сервиса из чужого compose-файла: имена
сервисов у разных проектов часто совпадают (`app`, `web`, `api`), и встроенный
DNS Docker вернёт непредсказуемый контейнер. Сайт из этого репозитория по той
же причине проксируется по уникальному алиасу `site-app`, а не по `app`.

Проверка:

```bash
docker compose up -d
docker compose exec caddy nslookup <имя_контейнера>    # резолвится?
docker compose exec caddy wget -qO- http://<имя_контейнера>:8000/ | head -c 200
docker compose exec caddy nslookup site-app            # сайт не перебит чужим app
```

`server misbehaving` или `SERVFAIL` от `127.0.0.11:53` в логах caddy означает,
что имени нет в его сетях: контейнер лежит, имя другое или сеть не подключена.

## 3. Подготовка сервера

```bash
# Docker + compose-plugin
curl -fsSL https://get.docker.com | sh

# Порты 80/443 должны быть свободны и открыты
ss -tlnp | grep -E ':(80|443)\s'     # пусто = хорошо
ufw allow 80,443/tcp                 # если включён ufw
```

Если порты заняты (частый случай — другой веб-сервер или панель управления), освободите
их до запуска: HTTPS-сертификаты выдаются через порт 80, а Caddy не поднимется,
если порт занят. См. [раздел 10](#10-если-что-то-пошло-не-так).

## 4. Установка

```bash
git clone https://github.com/NORMss/ProfileWebNORM.git
cd ProfileWebNORM
cp .env.example .env
nano .env
```

Минимум для первого запуска:

```env
SITE_URL=https://example.com
SITE_DOMAIN=example.com
ADMIN_DOMAIN=admin.example.com
ADMIN_HOST=admin.example.com
ADMIN_USER=<своё имя, не admin>
ADMIN_PASS=длинный-случайный-пароль
GITHUB_USERNAME=NORMss
TZ=UTC
```

Запуск:

```bash
docker compose up -d --build
```

Первая сборка занимает 2–5 минут. Caddy сам выпустит сертификаты Let's Encrypt
для обоих доменов — проверить:

```bash
docker compose logs caddy | grep -i "certificate obtained"
curl -sI https://example.com | head -1
```

Через несколько секунд после старта приложение делает первый синк с GitHub —
проекты появятся сами.

## 5. Подключение интеграций

Все шаги ниже выполняются уже на работающем сайте и не требуют
пересборки, кроме случаев, где меняется `.env`.

### 5.1. GitHub-токен (лимиты API + тепловая карта)

Без токена работают только публичные данные и с жёстким лимитом 60
запросов в час; тепловая карта контрибуций **не работает вообще** —
она использует GraphQL, который без токена недоступен.

Создайте **classic**-токен на github.com → Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate new token, отметьте:

- **`public_repo`** — репозитории, релизы, счётчики загрузок, issues, README;
- **`read:user`** — календарь контрибуций для тепловой карты.

Токен → в `.env` как `GITHUB_TOKEN`, затем `docker compose up -d`.
В админке нажмите «⟳ Синхронизировать с GitHub».

> Fine-grained токены для календаря контрибуций часто не срабатывают —
> если карта не появилась, а в логах есть `[sync] contributions`, возьмите classic.

### 5.2. Telegram-бот (посты и бэкапы)

Полная инструкция: **[docs/TELEGRAM.md](TELEGRAM.md)**. Кратко:

1. [@BotFather](https://t.me/BotFather) → `/newbot` → токен в `TELEGRAM_BOT_TOKEN`.
2. Добавьте бота **администратором канала** с правами «Публикация сообщений»
   и «Редактирование сообщений».
3. `TELEGRAM_CHANNEL=@ваш_канал` (или числовой `-100…` для приватного).
4. Для бэкапов: напишите боту `/start`, узнайте свой id у
   [@userinfobot](https://t.me/userinfobot) → `TELEGRAM_BACKUP_CHAT_ID=<id>`.
5. `docker compose up -d`.

Проверка: админка → «Публикации» → **«🔍 Диагностика»** покажет бота, канал
и не мешает ли webhook. Старые посты канала переносятся пересылкой боту
(см. TELEGRAM.md) — история через API недоступна.

### 5.3. Spotify (виджет «сейчас играет»)

1. Создайте приложение на https://developer.spotify.com/dashboard.
2. Добавьте **Redirect URI**: `https://admin.example.com/admin/spotify/callback`
   (точная строка показана в админке).
3. `SPOTIFY_CLIENT_ID` и `SPOTIFY_CLIENT_SECRET` → в `.env`, `docker compose up -d`.
4. Админка → «Обо мне и ссылки» → **«♫ Подключить Spotify»**.

Refresh token сохранится в БД — вручную его получать не нужно.

### 5.4. Автоперевод на английский

1. Получите ключ Google Cloud Translation API (включить **Cloud Translation API**
   в проекте с биллингом → Credentials → API key). Бесплатно 500 000 символов
   в месяц; альтернативы — DeepL Free и Azure Translator F0 (2 млн символов).
2. В `.env`:

   ```env
   TRANSLATE_PROVIDER=google
   GOOGLE_TRANSLATE_API_KEY=AIza...
   TRANSLATE_MONTHLY_LIMIT=450000   # необязательный свой стоп-кран
   ```

3. `docker compose up -d` → админка → вкладка **Переводы** → **Проверить ключ**.

Там же видно расход месячного лимита, ошибки API и статус перевода каждого
поста. Подробности и сравнение тарифов: [TRANSLATE.md](TRANSLATE.md).

### 5.5. Поисковики после смены домена

```env
INDEXNOW_KEY=<32 hex-символа, например openssl rand -hex 16>
GOOGLE_SITE_VERIFICATION=<content= мета-тега из Search Console>
YANDEX_VERIFICATION=<content= мета-тега из Вебмастера>
```

После перезапуска отправьте `https://<домен>/sitemap.xml` в Search Console и
Вебмастер и оформите «Изменение адреса» со старого домена. Пошаговый
чек-лист — в [SEO.md](SEO.md).

## 6. Наполнение сайта

Всё делается в админке `https://admin.example.com/admin` (Basic Auth):

| Вкладка | Что настраивается |
| --- | --- |
| **Проекты GitHub** | показать/скрыть репозиторий, категория Hard/Vibe, обложка (og-image, картинка из README или своя), сортировка проектов по умолчанию, ручной синк |
| **Обо мне и ссылки** | фото на главной, текст приветствия в Markdown с превью, ссылки соцсетей, подключение Spotify |
| **Публикации** | markdown-редактор с превью и фото, публикация/черновик, отправка в Telegram, импорт из канала, массовое удаление чекбоксами, ручной бэкап |
| **Переводы** | провайдер и остаток месячного лимита API, сравнение бесплатных тарифов, ошибки API, статус перевода каждого поста, ручной перевод и проверка ключа |

## 7. Данные и бэкапы

Всё состояние сайта — в каталоге `./data` (он же volume контейнера):

```
data/
  site.db          # SQLite: проекты, релизы, посты, настройки
  uploads/         # фото профиля, обложки проектов, картинки постов
```

**Автоматически:** если задан `TELEGRAM_BACKUP_CHAT_ID`, бот ежедневно
в 04:30 (по `TZ` сервера) присылает `site-backup-<дата>.tar.gz` с БД и
файлами в личный чат. Кнопка ручного бэкапа — в админке.

**Вручную:**

```bash
# снапшот без остановки сайта
docker compose exec app node -e "require('better-sqlite3')('/app/data/site.db').backup('/app/data/backup.db')"
tar -czf backup-$(date +%F).tar.gz -C data backup.db uploads
```

**Восстановление:** распакуйте архив в `data/` так, чтобы получились
`data/site.db` и `data/uploads/`, затем `docker compose restart app`.

## 8. Безопасность

- `/admin*` на основном домене отдаёт **404** — дважды: в приложении
  (middleware сверяет `Host`) и в Caddy (запросы не проксируются вовсе).
- Админка живёт только на `ADMIN_HOST` и закрыта Basic Auth; ссылок на неё
  на сайте нет, индексация запрещена (`robots.txt` + `X-Robots-Tag`).
- Небезопасные методы в админ-API проверяют заголовок `Origin`.
- Загруженные файлы отдаются через `/media/*` с валидацией имени — прямого
  доступа к каталогу `data` снаружи нет.
- `.env` и `data/` в `.gitignore` — не попадут в репозиторий.
- Бэкапы шлите **только в личный чат**, не в публичный канал.

## 9. Обновление

```bash
cd ProfileWebNORM
git pull
docker compose up -d --build
```

Миграции схемы SQLite применяются автоматически при старте, данные
сохраняются. Откат: `git checkout <старый-коммит> && docker compose up -d --build`
(перед обновлением полезно сделать бэкап из раздела 7).

## 10. Если что-то пошло не так

| Симптом | Причина и решение |
| --- | --- |
| `curl: (35) tlsv1 alert internal error`, сертификат не выдаётся | На 80/443 сидит другой сервис. Проверьте `ss -tlnp \| grep -E ':(80\|443)'` и `docker compose ps` — контейнер `caddy` будет в Exited. Освободите порты и `docker compose up -d` |
| Сертификат не выдаётся, порты свободны | DNS ещё не обновился (`dig +short example.com`) или провайдер блокирует 80/443 |
| Новый домен из `ALIAS_DOMAINS` открывается без HTTPS или с чужим сертификатом | Сертификат ещё не выпущен: `docker compose logs caddy \| grep -i acme` покажет причину — чаще всего A-запись домена смотрит не на этот сервер |
| `server block without any key is global configuration` в логах caddy | В `.env` пустой `ALIAS_DOMAINS`, а compose запускается не из каталога проекта (подстановка `${ALIAS_DOMAINS:-alias.localhost}` не сработала). Запускайте `docker compose` из корня репозитория или уберите строку `ALIAS_DOMAINS=` из `.env` |
| Пустой список проектов | Проверьте `GITHUB_USERNAME`, нажмите «Синхронизировать сейчас», смотрите `docker compose logs app \| grep sync` |
| Нет тепловой карты | Нет `GITHUB_TOKEN` или он без `read:user` (нужен classic-токен) |
| Импорт Telegram не видит посты | «🔍 Диагностика» в админке: установленный webhook блокирует getUpdates; для приватного канала нужен числовой id; посты старше 24 ч и до добавления бота — только пересылкой |
| Виджет Spotify не появляется | Не подключён аккаунт (кнопка в админке) или Redirect URI в приложении Spotify не совпадает со строкой из админки |
| Бэкап не приходит | Боту не написали `/start`, указан id канала вместо личного, либо архив > 50 МБ (лимит Telegram) |
| `no space left on device` | `docker system prune -af` и проверьте размер `data/uploads` |
| Сборка идёт очень долго или «зависает» | См. [раздел 12](#12-медленная-сборка) — почти всегда это нехватка RAM или сброшенный кеш слоёв |

Полезные команды:

```bash
docker compose ps                      # статус контейнеров
docker compose logs -f app             # логи приложения (синк, бэкапы, ошибки)
docker compose logs caddy | tail -50   # выдача сертификатов
docker compose restart app             # перезапуск без пересборки
```

## 12. Медленная сборка

Нормальное время на минимальной конфигурации: **первая сборка 3–6 минут**,
последующие (если менялся только код) — **40–90 секунд**.

Сначала посмотрите, на каком шаге стоит сборка:

```bash
docker compose build --progress=plain
```

**Причины и что делать:**

1. **Мало памяти.** Astro-сборка на 512 МБ без swap упирается в память:
   процесс не падает, а часами свопится или молча убивается OOM-killer.
   Проверить и добавить 2 ГБ swap:

   ```bash
   free -h                     # Swap: 0B — вот и причина
   fallocate -l 2G /swapfile && chmod 600 /swapfile
   mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab   # чтобы пережил перезагрузку
   dmesg | grep -i "killed process"                  # следы OOM-killer
   ```

2. **Сброшен кеш слоёв.** `npm ci` кешируется по `package-lock.json`;
   если менялся только код — этот шаг должен пропускаться (`CACHED`).
   Если он каждый раз выполняется заново, значит слои чистили
   (`docker system prune -a`) или менялся lock-файл — первая сборка после
   этого закономерно долгая, следующая будет быстрой.

3. **Медленный/нестабильный канал до registry.npmjs.org.** Кеш npm вынесен
   в BuildKit cache mount, поэтому повторные сборки не качают пакеты заново.
   Проверить скорость: `curl -o /dev/null -w '%{speed_download}\n' https://registry.npmjs.org/astro`.

4. **Раздутый build-контекст.** Первая строка вывода `docker compose build`
   показывает размер: `transferring context: … B`. Должны быть сотни килобайт.
   Если мегабайты и больше — в каталоге появилось что-то, не покрытое
   `.dockerignore` (например, локальный `node_modules` после `npm install`
   на сервере или дампы БД).

### Как понять, на каком шаге стоит

```bash
# 1. Строка с последним шагом (Step 10/16 … или #12 [build 2/3] …)
docker compose build --progress=plain 2>&1 | tail -5

# 2. Одновременно во втором терминале — что происходит с памятью
free -h; docker stats --no-stream
dmesg | tail -20 | grep -i "killed process"    # следы OOM-killer
```

Практически всегда «зависание» приходится на `npm ci` или `npm run build`
и означает нехватку RAM. Лечится swap-файлом (см. пункт 1 выше) —
или тем, что сборку вообще убирают с сервера.

### Сборка вне сервера (рекомендуется для 512 МБ)

В репозитории есть workflow `.github/workflows/docker-image.yml`: при пуше
в `main` образ собирается на раннерах GitHub и публикуется в GHCR
(`ghcr.io/normss/profilewebnorm:latest`). На VPS тогда ничего не собирается:

```bash
git pull                       # только конфиги: compose, Caddyfile
docker compose pull            # забрать готовый образ
docker compose up -d
```

Один раз проверьте, что образ доступен: в GitHub → Packages сделайте пакет
**public**, либо авторизуйтесь на сервере токеном с правом `read:packages`:

```bash
echo <GITHUB_TOKEN> | docker login ghcr.io -u NORMss --password-stdin
```

Локальная сборка при этом никуда не делась — `docker compose up -d --build`
по-прежнему собирает из исходников (например, когда правите код на сервере).

## 11. Публичные адреса

| Адрес | Назначение |
| --- | --- |
| `/` | Главная: «обо мне», релизы, Spotify, тепловая карта |
| `/projects`, `/projects/<repo>` | Проекты и страница проекта |
| `/publications`, `/publications/<id>` | Публикации |
| `/en`, `/en/projects`, `/en/publications/<id>` | Английская версия тех же страниц |
| `/rss.xml`, `/en/rss.xml` | RSS-лента публикаций (русская и английская) |
| `/sitemap.xml` | Карта сайта обеих языковых версий с hreflang |
| `/robots.txt` | На публичном хосте — ссылка на sitemap, на админ-хосте — `Disallow: /` |
| `/<INDEXNOW_KEY>.txt` | Файл-подтверждение ключа IndexNow (если ключ задан) |
| `/api/now-playing` | JSON текущего трека (кеш 30 с) |
| `/media/avatar`, `/media/cover/<id>`, `/media/post/<file>` | Загруженные изображения |
| `https://<ADMIN_HOST>/admin` | Админка (Basic Auth, только этот хост) |
| `https://<домен из ALIAS_DOMAINS>/*` | 301 на `SITE_DOMAIN`; сертификат есть у каждого домена |
