import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_APPEARANCE, NEW_YEAR_APPEARANCE, isAppearance, parseAppearance, palettes, paletteStyle,
} from '../src/lib/appearance.ts';

test('existing databases and corrupt settings keep the original appearance', () => {
  for (const raw of ['', 'null', '[]', '{', '{}', JSON.stringify({ ...DEFAULT_APPEARANCE, palette: 'removed' })]) {
    assert.deepEqual(parseAppearance(raw), DEFAULT_APPEARANCE);
  }
  assert.deepEqual(parseAppearance(JSON.stringify(NEW_YEAR_APPEARANCE)), NEW_YEAR_APPEARANCE);
});

test('only catalog palettes and typed decoration settings can be persisted', () => {
  for (const palette of ['original', ...palettes.map((p) => p.id)]) {
    assert.equal(isAppearance({ ...DEFAULT_APPEARANCE, palette }), true);
  }
  for (const patch of [
    { palette: 'red; background:url(https://example.com)' }, { snow: 'true' },
    { garland: 1 }, { twinkle: null }, { snowDensity: ['light'] }, { snowDensity: 'extreme' },
    { extra: true },
  ]) assert.equal(isAppearance({ ...DEFAULT_APPEARANCE, ...patch }), false);
  assert.equal(isAppearance(null), false);
  assert.equal(isAppearance([]), false);
});

test('every bundled resource has complete colors and its source URL', () => {
  assert.equal(new Set(palettes.map((p) => p.id)).size, palettes.length);
  for (const p of palettes) {
    assert.match(p.source, /^https:\/\/terminalcolors\.com\/themes\//);
    assert.match(p.resource, /^https:\/\/terminalcolors\.com\/downloads\/ghostty\//);
    assert.equal(p.colors.length, 16);
    for (const color of [p.background, p.foreground, p.selection, ...p.colors]) {
      assert.match(color, /^#[\da-f]{6}$/i);
    }
    const style = paletteStyle(p.id);
    assert.ok(style.includes(`--bg:${p.background}`));
    assert.ok(style.includes(`color-scheme:${p.mode}`));
    assert.ok(!style.includes('undefined'));
    assert.ok(!style.includes('https://'));
  }
  assert.equal(paletteStyle('original'), '');
  assert.equal(paletteStyle('unknown'), '');
});
