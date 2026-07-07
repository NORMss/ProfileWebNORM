import type { APIRoute } from 'astro';
import { runBackup } from '../../../lib/backup';

/** Ручной бэкап данных в Telegram из админки. */
export const POST: APIRoute = async () => {
  try {
    const { sizeBytes, fileName } = await runBackup();
    return Response.json({ ok: true, fileName, sizeKb: Math.round(sizeBytes / 1024) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
};
