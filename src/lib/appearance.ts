import palettes from './theme-palettes.json' with { type: 'json' };

export { palettes };
export type SnowDensity = 'light' | 'medium' | 'heavy';
export interface Appearance {
  palette: string;
  snow: boolean;
  garland: boolean;
  snowDensity: SnowDensity;
  twinkle: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  palette: 'original', snow: false, garland: false, snowDensity: 'light', twinkle: false,
};
export const NEW_YEAR_APPEARANCE: Appearance = {
  palette: 'nord-default', snow: true, garland: true, snowDensity: 'medium', twinkle: true,
};

/** Shared by the API and renderer. Never accept arbitrary CSS from settings. */
export function isAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === Object.keys(DEFAULT_APPEARANCE).length &&
    typeof v.palette === 'string' &&
    (v.palette === 'original' || palettes.some((p) => p.id === v.palette)) &&
    typeof v.snow === 'boolean' && typeof v.garland === 'boolean' && typeof v.twinkle === 'boolean' &&
    typeof v.snowDensity === 'string' && ['light', 'medium', 'heavy'].includes(v.snowDensity);
}

export function parseAppearance(raw: string): Appearance {
  try {
    const value: unknown = JSON.parse(raw);
    if (isAppearance(value)) return value;
  } catch { /* Old databases and invalid backups retain the original appearance. */ }
  return { ...DEFAULT_APPEARANCE };
}

const mix = (color: string, amount: number, base = 'transparent') =>
  `color-mix(in srgb, ${color} ${amount}%, ${base})`;

/** Semantic glass tokens derived exclusively from the bundled terminal palette. */
export function paletteStyle(id: string): string {
  const p = palettes.find((palette) => palette.id === id);
  if (!p) return '';
  const light = p.mode === 'light';
  const [black, red, green, yellow, blue, purple, cyan, white] = p.colors;
  const accent = blue;
  const tokens: Record<string, string> = {
    'color-scheme': p.mode,
    '--bg': p.background, '--fg': p.foreground,
    '--text-body': mix(p.foreground, 88, p.background),
    '--green': green,
    '--accent-grad': `linear-gradient(135deg, ${accent}, ${cyan})`,
    '--on-accent': contrastText(accent, cyan),
    '--accent-shadow': `0 10px 30px ${mix(accent, 25)}`,
    '--active': mix(accent, light ? 24 : 20),
    '--link': mix(accent, light ? 75 : 65, p.foreground),
    '--link-underline': mix(accent, 45),
    '--selection': p.selection,
    '--ripple': mix(accent, 30),
    '--card-overlay': mix(p.background, 94),
    '--inset-top': mix(p.foreground, 12),
    '--pre-bg': mix(black, light ? 8 : 35),
    '--code-bg': mix(p.foreground, 8),
    '--input-bg': mix(p.background, 85),
    '--badge-admin-bg': mix(accent, 18), '--badge-admin-fg': accent,
    '--chip-vibe-bg': mix(purple, 20), '--chip-vibe-fg': purple,
    '--toast-bg': mix(p.background, 97),
    '--tint-gh-bg': mix(p.foreground, 8), '--tint-gh-line': mix(p.foreground, 18),
    '--blob-a': `radial-gradient(circle, ${mix(accent, light ? 16 : 22)}, transparent 70%)`,
    '--blob-b': `radial-gradient(circle, ${mix(cyan, light ? 14 : 20)}, transparent 70%)`,
    '--blob-c': `radial-gradient(circle, ${mix(purple, light ? 12 : 18)}, transparent 70%)`,
    '--heat-0': mix(p.foreground, 7), '--heat-4': green,
    '--shadow-lg': `0 20px 60px ${mix(black, light ? 12 : 40)}`,
    '--shadow-md': `0 12px 40px ${mix(black, light ? 10 : 30)}`,
    '--holiday-red': red, '--holiday-green': green, '--holiday-gold': yellow,
    '--holiday-blue': cyan, '--snow-color': light ? mix(blue, 65, p.foreground) : white,
    '--select-arrow': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${p.foreground.replace('#', '%23')}' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  };
  for (const n of [65, 60, 55, 50, 45]) tokens[`--fg-${n}`] = mix(p.foreground, light ? n + 30 : n + 14, p.background);
  for (const n of [5, 6, 7, 8, 10]) tokens[`--glass-${String(n).padStart(2, '0')}`] = mix(light ? p.background : p.foreground, light ? 65 + n : n);
  for (const n of [10, 12, 13, 14, 15, 18]) tokens[`--line-${n}`] = mix(p.foreground, n);
  for (const n of [1, 2, 3]) tokens[`--heat-${n}`] = mix(green, [0, 28, 50, 75][n]);
  return Object.entries(tokens).map(([key, value]) => `${key}:${value}`).join(';');
}

/** Pick a readable label color for both ends of the accent gradient. */
function contrastText(...colors: string[]): string {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = colors.map(luminance);
  return Math.min(...values.map((l) => (l + 0.05) / 0.05)) >=
    Math.min(...values.map((l) => 1.05 / (l + 0.05))) ? '#000000' : '#ffffff';
}
