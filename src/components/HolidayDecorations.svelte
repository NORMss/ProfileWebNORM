<script lang="ts">
  import type { SnowDensity } from '../lib/appearance';
  let { kind, density = 'light', twinkle = false, contained = false } = $props<{
    kind: 'snow' | 'garland'; density?: SnowDensity; twinkle?: boolean; contained?: boolean;
  }>();
  const counts = { light: 16, medium: 28, heavy: 40 };
</script>

{#if kind === 'snow'}
  <div class="snow" class:contained aria-hidden="true">
    {#each Array(counts[density]) as _, i}
      <span class="flake" style={`--x:${(i * 37 + 7) % 100}%;--size:${7 + (i * 7) % 10}px;--duration:${12 + (i * 3) % 13}s;--delay:-${(i * 7) % 25}s;--drift:${(i % 2 ? 1 : -1) * (20 + i % 30)}px`}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10 1v18M2.2 5.5l15.6 9M2.2 14.5l15.6-9M7 3l3 3 3-3M7 17l3-3 3 3" /></svg>
      </span>
    {/each}
  </div>
{:else}
  <div class="garland" class:twinkle aria-hidden="true">
    <svg class="wire" viewBox="0 0 400 32" preserveAspectRatio="none" fill="none"><path d="M0 4 Q50 26 100 4 Q150 26 200 4 Q250 26 300 4 Q350 26 400 4" stroke="currentColor" stroke-width="1.5" /></svg>
    {#each Array(16) as _, i}
      <span class="bulb" style={`left:${3 + i * 6.2}%;top:${[8, 13, 13, 8][i % 4]}px;--bulb:var(--holiday-${['red', 'gold', 'green', 'blue'][i % 4]});--delay:-${i % 4}s`}></span>
    {/each}
  </div>
{/if}

<style>
  .snow { position: fixed; inset: 0; z-index: 60; overflow: hidden; pointer-events: none; color: var(--snow-color, #e5e9f0); }
  .snow.contained { position: absolute; z-index: 2; }
  .flake { position: absolute; top: -24px; left: var(--x); width: var(--size); height: var(--size); opacity: .65; animation: snowfall var(--duration) var(--delay) linear infinite; }
  .flake svg { display: block; width: 100%; height: 100%; }
  @keyframes snowfall { from { transform: translate3d(0, -24px, 0) rotate(0); } to { transform: translate3d(var(--drift), calc(100vh + 24px), 0) rotate(160deg); } }
  .contained .flake { animation-name: preview-snowfall; }
  @keyframes preview-snowfall { to { transform: translate3d(var(--drift), 350px, 0) rotate(160deg); } }
  .garland { position: absolute; top: -9px; left: 0; right: 0; height: 36px; pointer-events: none; z-index: 2; color: var(--holiday-green, #a3be8c); }
  .wire { width: 100%; height: 26px; opacity: .85; }
  .bulb { position: absolute; width: 7px; height: 12px; border-radius: 3px 3px 50% 50%; background: var(--bulb); box-shadow: 0 2px 9px 2px color-mix(in srgb, var(--bulb) 45%, transparent); transform: rotate(8deg); }
  .bulb::before { content: ''; position: absolute; left: 2px; top: -4px; width: 3px; height: 4px; background: currentColor; }
  .twinkle .bulb { animation: glow 4s var(--delay) ease-in-out infinite; }
  @keyframes glow { 0%, 100% { opacity: .65; } 50% { opacity: 1; } }
  @media (max-width: 600px) { .flake:nth-child(n+25) { display: none; } }
  @media (prefers-reduced-motion: reduce) { .snow { display: none; } .twinkle .bulb { animation: none; } }
  @media print { .snow, .garland { display: none; } }
</style>
