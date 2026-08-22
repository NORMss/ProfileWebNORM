# Локальные блоки Caddy

Файлы `*.caddy` из этого каталога подключаются в конец `deploy/Caddyfile`
(`import /etc/caddy/local/*.caddy`) и **не попадают в git** — здесь живут
настройки конкретного сервера, которые не должны конфликтовать при `git pull`.

Типичный случай — ещё одно приложение на том же сервере:

```caddy
# deploy/local/app.caddy
app.example.com {
	reverse_proxy <имя_контейнера>:8000
}

app.example.ru {
	redir https://app.example.com{uri} permanent
}
```

Апстримом указывайте **имя контейнера** (`docker ps`), а не имя сервиса из
чужого compose-файла: имена сервисов у разных проектов часто совпадают
(`app`, `web`, `api`), и встроенный DNS Docker может вернуть не тот контейнер.

Чтобы caddy видел контейнеры другого проекта, его нужно подключить к их сети —
через `docker-compose.override.yml` (тоже не в git), см. docs/DEPLOY.md.

После правок: `docker compose restart caddy` и
`docker compose logs caddy | tail -20`.
