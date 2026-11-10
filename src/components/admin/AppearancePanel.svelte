<script lang="ts">
  import { DEFAULT_APPEARANCE, NEW_YEAR_APPEARANCE, palettes, paletteStyle, type Appearance } from '../../lib/appearance';
  import HolidayDecorations from '../HolidayDecorations.svelte';

  let { initial, onSaved } = $props<{ initial: Appearance; onSaved: (value: Appearance) => void }>();
  let draft = $state<Appearance>({ ...initial });
  let saved = $state<Appearance>({ ...initial });
  let saving = $state(false);
  let message = $state('');
  let failed = $state(false);
  const selected = $derived(palettes.find((p) => p.id === draft.palette));
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));

  async function save() {
    saving = true;
    message = '';
    failed = false;
    const submitted = { ...draft };
    try {
      const res = await fetch('/admin/api/appearance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      saved = submitted;
      onSaved(submitted);
      message = 'Оформление сохранено. Изменения видны после обновления страниц сайта.';
    } catch (error) {
      failed = true;
      message = `Не удалось сохранить: ${error instanceof Error ? error.message : error}`;
    } finally {
      saving = false;
    }
  }
</script>

<section class="appearance-panel">
  <div class="heading">
    <div><h2>Оформление сайта</h2><p>Одна тема для всех посетителей и обеих языковых версий.</p></div>
    <button type="button" onclick={() => { draft = { ...NEW_YEAR_APPEARANCE }; message = ''; }} disabled={saving}>❄ Новогодняя тема</button>
  </div>

  <fieldset disabled={saving}>
    <legend>Цветовая палитра</legend>
    <p>Готовые цвета из <a href="https://terminalcolors.com/" target="_blank" rel="noopener noreferrer">TerminalColors ↗</a>. Палитры доступны без внешних запросов.</p>
    <div class="palettes">
      <label class="palette" class:selected={draft.palette === 'original'}>
        <input type="radio" name="palette" value="original" bind:group={draft.palette} />
        <span><strong>Оригинальная</strong><small>Авто · по настройке устройства</small></span>
      </label>
      {#each palettes as palette}
        <label class="palette" class:selected={draft.palette === palette.id}>
          <input type="radio" name="palette" value={palette.id} bind:group={draft.palette} />
          <span><strong>{palette.name}</strong><small>{palette.mode === 'light' ? 'Светлая' : 'Тёмная'}</small></span>
          <span class="swatches" aria-hidden="true">
            {#each [palette.background, palette.foreground, ...palette.colors.slice(1, 7)] as color}<i style={`background:${color}`}></i>{/each}
          </span>
        </label>
      {/each}
    </div>
    {#if selected}<p class="source"><a href={selected.source} target="_blank" rel="noopener noreferrer">{selected.name} на TerminalColors ↗</a></p>{/if}
  </fieldset>

  <fieldset disabled={saving}>
    <legend>Новогоднее оформление</legend>
    <div class="options">
      <label><input type="checkbox" bind:checked={draft.snow} /> Падающие снежинки</label>
      <label class="density">Количество снега
        <select bind:value={draft.snowDensity} disabled={!draft.snow || saving}>
          <option value="light">Лёгкий</option><option value="medium">Умеренный</option><option value="heavy">Снегопад</option>
        </select>
      </label>
      <label><input type="checkbox" bind:checked={draft.garland} /> Гирлянда в шапке</label>
      <label><input type="checkbox" bind:checked={draft.twinkle} disabled={!draft.garland || saving} /> Мягкое мерцание огоньков</label>
    </div>
    <p>Украшения не мешают нажимать ссылки. При включённом уменьшении движения снег и мерцание отключаются.</p>
  </fieldset>

  <h3>Предпросмотр</h3>
  <div class="preview" style={paletteStyle(draft.palette)}>
    {#if draft.snow}<HolidayDecorations kind="snow" density={draft.snowDensity} contained />{/if}
    <div class="preview-nav">
      {#if draft.garland}<HolidayDecorations kind="garland" twinkle={draft.twinkle} />{/if}
      <strong>☺</strong><span class="preview-active">Главная</span><span>Проекты</span><span>Посты</span>
    </div>
    <div class="preview-card"><small>NORMno · {selected?.name ?? 'Оригинальная тема'}</small><h3>Привет, мир!</h3><p>Мои проекты, заметки и немного праздничного настроения.</p><span class="preview-button">Смотреть проекты ↗</span></div>
  </div>

  <div class="actions">
    <button type="button" class="primary" onclick={save} disabled={saving || !dirty}>{saving ? 'Сохранение…' : 'Сохранить оформление'}</button>
    <button type="button" onclick={() => { draft = { ...saved }; message = ''; }} disabled={saving || !dirty}>Отменить изменения</button>
    <button type="button" onclick={() => { draft = { ...DEFAULT_APPEARANCE }; message = ''; }} disabled={saving}>Вернуть оригинальную тему</button>
    <span>{dirty ? 'Есть несохранённые изменения' : 'Настройки сохранены'}</span>
  </div>
  <p class:error={failed} role="status" aria-live="polite">{message}</p>
</section>

<style>
  .appearance-panel { border: 1px solid var(--line-13); border-radius: 28px; padding: clamp(16px, 4vw, 28px); background: var(--glass-05); }
  .heading, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
  .heading { justify-content: space-between; margin-bottom: 24px; }
  h2 { margin: 0; font-size: 20px; } h3 { font-size: 16px; }
  p, .actions span { font-size: 13px; color: var(--fg-60); line-height: 1.6; }
  a { color: var(--link); } button, select { font: inherit; font-size: 13px; color: var(--fg); background: var(--glass-08); border: 1px solid var(--line-15); border-radius: 14px; padding: 11px 16px; cursor: pointer; }
  button:hover { background: var(--glass-10); } button:disabled, select:disabled { cursor: default; opacity: .5; }
  fieldset { min-width: 0; border: 0; padding: 0; margin: 0 0 26px; } legend { font-size: 16px; font-weight: 700; padding: 0; }
  .palettes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 10px; }
  .palette { display: flex; gap: 9px; flex-wrap: wrap; align-items: center; padding: 13px; border: 1px solid var(--line-15); border-radius: 16px; cursor: pointer; }
  .palette.selected { border-color: var(--link); background: var(--active); }
  .palette strong, .palette small { display: block; } .palette strong { font-size: 13px; } .palette small { margin-top: 4px; color: var(--fg-60); font-size: 11px; }
  input { accent-color: var(--link); } .swatches { margin-left: auto; display: flex; } .swatches i { width: 10px; height: 20px; } .swatches i:first-child { border-radius: 5px 0 0 5px; } .swatches i:last-child { border-radius: 0 5px 5px 0; }
  .options { display: grid; gap: 16px; margin-top: 18px; font-size: 14px; } .options label { display: flex; align-items: center; gap: 10px; } .density { flex-wrap: wrap; }
  .preview { position: relative; isolation: isolate; overflow: hidden; border-radius: 22px; padding: 28px 16px 20px; background: var(--bg); color: var(--fg); border: 1px solid var(--line-15); }
  .preview-nav { position: relative; display: flex; align-items: center; justify-content: center; gap: clamp(4px, 2vw, 14px); padding: 10px; margin: 0 auto 22px; max-width: 400px; border: 1px solid var(--line-14); border-radius: 24px; background: var(--glass-07); font-size: 12px; }
  .preview-nav span { padding: 7px; } .preview-active { border-radius: 15px; background: var(--active); }
  .preview-card { max-width: 410px; margin: auto; border: 1px solid var(--line-13); background: var(--glass-05); border-radius: 18px; padding: 20px; }
  .preview-card h3 { font-size: 24px; margin: 12px 0; } .preview-card small { color: var(--fg-60); } .preview-card p { color: var(--text-body); }
  .preview-button { display: inline-block; margin-top: 8px; padding: 10px 16px; background: var(--accent-grad); color: var(--on-accent); border-radius: 12px; font-size: 13px; font-weight: 600; }
  .actions { margin-top: 22px; } .primary { background: var(--accent-grad); color: var(--on-accent); font-weight: 600; } .error { color: var(--holiday-red); }
</style>
