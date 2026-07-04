const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

/** «28 июн 2026» из ISO-строки. */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateFmt.format(d).replace(/\.\s?/g, ' ').replace(/\s?г\s?$/, '').trim();
}

/** 12345 → «12,3k» — компактные числа для звёзд и загрузок. */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '').replace('.', ',') + 'k';
  return String(n);
}
