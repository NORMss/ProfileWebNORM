import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

/** Каталог для загруженных через админку файлов — рядом с БД, попадает в тот же volume/бэкап. */
export function uploadsDir(): string {
  const dir = path.join(path.dirname(path.resolve(config.dbPath)), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const IMAGE_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export function avatarPath(ext: string): string {
  return path.join(uploadsDir(), `avatar.${ext}`);
}

export function coverPath(repoId: number, ext: string): string {
  return path.join(uploadsDir(), `cover-${repoId}.${ext}`);
}
