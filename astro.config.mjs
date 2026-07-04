// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte()],
  server: { host: true, port: 4321 },
  vite: {
    ssr: {
      external: ['better-sqlite3', 'node-cron'],
    },
  },
});
