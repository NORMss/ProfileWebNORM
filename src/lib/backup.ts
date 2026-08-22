import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config';
import { rawSqlite } from './db';
import { uploadsDir } from './uploads';

const execFileAsync = promisify(execFile);

/**
 * Бэкап всех данных сайта (SQLite + загруженные файлы) в Telegram:
 * консистентная копия БД через SQLite online-backup → tar.gz → sendDocument
 * боту в личный чат TELEGRAM_BACKUP_CHAT_ID.
 */
export async function runBackup(): Promise<{ sizeBytes: number; fileName: string }> {
  const token = config.telegramBotToken;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env');
  const chatId = config.telegramBackupChatId;
  if (!chatId) throw new Error('TELEGRAM_BACKUP_CHAT_ID не задан в .env (личный chat_id, не канал)');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'normno-backup-'));
  try {
    // Консистентный снапшот БД (безопасно при WAL и параллельной записи)
    await rawSqlite.backup(path.join(workDir, 'site.db'));

    // uploads кладём рядом, чтобы в архиве были и БД, и картинки
    const uploads = uploadsDir();
    const tarSources = ['site.db'];
    if (fs.existsSync(uploads) && fs.readdirSync(uploads).length > 0) {
      fs.cpSync(uploads, path.join(workDir, 'uploads'), { recursive: true });
      tarSources.push('uploads');
    }

    const fileName = `normno-backup-${stamp}.tar.gz`;
    const archivePath = path.join(workDir, fileName);
    await execFileAsync('tar', ['-czf', archivePath, '-C', workDir, ...tarSources]);

    const stat = fs.statSync(archivePath);
    if (stat.size > 49 * 1024 * 1024) {
      throw new Error(`Архив ${(stat.size / 1e6).toFixed(1)} МБ — больше лимита Telegram для ботов (50 МБ)`);
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', `💾 Бэкап normno.com · ${new Date().toLocaleString('ru-RU')} · ${(stat.size / 1024).toFixed(0)} КБ`);
    form.append('document', new Blob([fs.readFileSync(archivePath)], { type: 'application/gzip' }), fileName);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description ?? `HTTP ${res.status}`}`);

    console.log(`[backup] отправлен ${fileName} (${stat.size} байт)`);
    return { sizeBytes: stat.size, fileName };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
