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
  vite: {
    ssr: {
      external: ['better-sqlite3', 'node-cron'],
    },
  },
});
