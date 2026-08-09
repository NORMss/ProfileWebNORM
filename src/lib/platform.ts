/**
 * Определение платформы файла релиза по расширению/имени —
 * чтобы в меню загрузки рядом с каждым файлом стояла иконка ОС.
 */

export type PlatformId = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'java' | 'archive' | 'file';

export interface AssetPlatform {
  id: PlatformId;
  /** Подпись для пользователя: «Windows», «macOS», … */
  label: string;
}

const LABELS: Record<PlatformId, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  java: 'Java',
  archive: 'Архив',
  file: 'Файл',
};

/** Однозначные расширения: по ним платформа определяется без вариантов. */
const BY_EXT: Record<string, PlatformId> = {
  exe: 'windows',
  msi: 'windows',
  msix: 'windows',
  msixbundle: 'windows',
  appx: 'windows',
  appxbundle: 'windows',
  dmg: 'macos',
  pkg: 'macos',
  apk: 'android',
  aab: 'android',
  apks: 'android',
  ipa: 'ios',
  deb: 'linux',
  rpm: 'linux',
  appimage: 'linux',
  snap: 'linux',
  flatpak: 'linux',
  jar: 'java',
  zip: 'archive',
  '7z': 'archive',
  rar: 'archive',
  tar: 'archive',
  gz: 'archive',
  xz: 'archive',
  bz2: 'archive',
  tgz: 'archive',
};

/** Подсказки в имени файла — для универсальных расширений вроде .zip или .tar.gz. */
const BY_HINT: [RegExp, PlatformId][] = [
  [/(^|[^a-z])(win(dows)?(32|64)?|x86_64-pc-windows|winnt)([^a-z]|$)/i, 'windows'],
  [/(^|[^a-z])(mac(os)?|osx|darwin|apple[-_]?silicon|universal2)([^a-z]|$)/i, 'macos'],
  [/(^|[^a-z])(linux|ubuntu|debian|fedora|arch|musl|gnu)([^a-z]|$)/i, 'linux'],
  [/(^|[^a-z])(android)([^a-z]|$)/i, 'android'],
  [/(^|[^a-z])(ios|iphone|ipad)([^a-z]|$)/i, 'ios'],
];

/** Расширение файла в нижнем регистре: «Setup-1.2.3.tar.gz» → «gz». */
function extOf(name: string): string {
  const clean = name.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

export function detectPlatform(name: string): AssetPlatform {
  const ext = extOf(name);
  const byExt = BY_EXT[ext];

  // Универсальные архивы уточняем по имени: «app-1.0-linux-x64.zip» → Linux
  if (!byExt || byExt === 'archive') {
    for (const [re, id] of BY_HINT) {
      if (re.test(name)) return { id, label: LABELS[id] };
    }
  }

  const id = byExt ?? 'file';
  return { id, label: LABELS[id] };
}

/** 15728640 → «15 МБ». Размер ассета GitHub отдаёт в байтах. */
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} МБ`;
  return `${(mb / 1024).toFixed(1).replace('.', ',')} ГБ`;
}
