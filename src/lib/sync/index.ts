import cron from 'node-cron';
import { config } from '../config';
import { setSetting } from '../settings';
import { syncGithub } from './github';
import { syncTelegram } from './telegram';

let running = false;

/** Полный синк: GitHub + Telegram. Повторный вызов во время работы игнорируется. */
export async function runSync(): Promise<{ repos: number; imported: number }> {
  if (running) return { repos: 0, imported: 0 };
  running = true;
  const startedAt = Date.now();
  try {
    let repos = 0;
    let imported = 0;
    try {
      repos = (await syncGithub()).repos;
    } catch (e) {
      console.error('[sync] GitHub failed:', e);
    }
    try {
      imported = (await syncTelegram()).imported;
    } catch (e) {
      console.error('[sync] Telegram failed:', e);
    }
    setSetting('last_sync', new Date().toISOString());
    console.log(`[sync] done in ${Date.now() - startedAt}ms: repos=${repos}, tg_imported=${imported}`);
    return { repos, imported };
  } finally {
    running = false;
  }
}

/** Запускает cron внутри процесса приложения; вызывается один раз при старте сервера. */
export function startScheduler(): void {
  const store = globalThis as { __syncCronStarted?: boolean };
  if (store.__syncCronStarted) return;
  store.__syncCronStarted = true;

  const every = config.syncIntervalMin;
  cron.schedule(`*/${every} * * * *`, () => {
    void runSync();
  });
  console.log(`[sync] scheduler started: every ${every} min`);

  // Первичный синк — в фоне, не блокируя старт сервера.
  setTimeout(() => void runSync(), 3_000);
}
