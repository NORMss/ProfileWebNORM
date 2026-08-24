// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte()],
  // Проверка Origin для админ-API живёт в src/middleware.ts и сравнивает хосты:
  // за reverse-proxy (Caddy → http) встроенная проверка Astro режет запросы
  // из-за несовпадения схемы https/http.
  security: { checkOrigin: false },
  server: { host: true, port: 4321 },
  build: {
    // Стили публичных страниц — это ~20 КБ на страницу (после сжатия около 4).
    // Отдельным файлом они стоят лишнего похода на сервер перед первой
    // отрисовкой, а CDN перед сайтом нет: инлайним прямо в HTML.
    inlineStylesheets: 'always',
  },
  vite: {
    ssr: {
      // sharp — нативный модуль с бинарником libvips, бандлить его нельзя
      external: ['better-sqlite3', 'node-cron', 'sharp'],
    },
  },
});
