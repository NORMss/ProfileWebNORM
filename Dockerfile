# syntax=docker/dockerfile:1

# База: audit/fund/notifier заметно замедляют npm на слабом канале
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false

# Зависимости для сборки (dev + prod). Слой кешируется по package-lock.json,
# кеш npm вынесен в mount — пакеты не скачиваются заново даже при смене версий.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Только прод-зависимости для финального образа.
# Отдельная стадия — BuildKit собирает её параллельно с deps.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM deps AS build
# Ограничиваем кучу Node: на VPS с 512 МБ сборка иначе разрастается
# и уходит в своп — снаружи это выглядит как зависший шаг
ENV NODE_OPTIONS=--max-old-space-size=512
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
