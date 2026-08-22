import { DEFAULT_LANG, type Lang } from './i18n';

const dateFmt: Record<Lang, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
};

/** «28 июн 2026» / «28 Jun 2026» из ISO-строки. */
export function formatDate(iso: string, lang: Lang = DEFAULT_LANG): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const formatted = dateFmt[lang].format(d);
  if (lang !== 'ru') return formatted;
  return formatted.replace(/\.\s?/g, ' ').replace(/\s?г\s?$/, '').trim();
}

/** 12345 → «12,3k» (ru) / «12.3k» (en) — компактные числа для звёзд и загрузок. */
export function formatCount(n: number, lang: Lang = DEFAULT_LANG): string {
  const sep = (value: string) => (lang === 'ru' ? value.replace('.', ',') : value);
  if (n >= 1_000_000) return sep((n / 1_000_000).toFixed(1).replace('.0', '')) + 'M';
  if (n >= 1_000) return sep((n / 1_000).toFixed(1).replace('.0', '')) + 'k';
  return String(n);
}

/** Полное число с разделителями разрядов по локали. */
export function formatNumber(n: number, lang: Lang = DEFAULT_LANG): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-GB').format(n);
}
