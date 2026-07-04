<script lang="ts">
  interface RepoRow {
    id: number;
    name: string;
    description: string;
    category: string;
    visible: number;
  }
  interface PostRow {
    id: number;
    title: string;
    bodyMd: string;
    source: string;
    status: string;
    createdAt: string;
  }
  interface About {
    text: string;
    telegram: string;
    youtube: string;
    github: string;
  }

  let {
    repos: initialRepos,
    posts: initialPosts,
    about: initialAbout,
    avatarUrl: initialAvatarUrl,
    lastSync,
    tgLastImport,
  } = $props<{
    repos: RepoRow[];
    posts: PostRow[];
    about: About;
    avatarUrl: string;
    lastSync: string;
    tgLastImport: { at: string; count: number } | null;
  }>();

  let tab = $state<'projects' | 'about' | 'posts'>('projects');
  let repos = $state<RepoRow[]>(initialRepos);
  let posts = $state<PostRow[]>(initialPosts);
  let about = $state<About>({ ...initialAbout });
  let avatarUrl = $state(initialAvatarUrl);
  let avatarFile = $state<FileList | null>(null);
  let uploadingAvatar = $state(false);
  let aboutPreviewHtml = $state('');
  let showAboutPreview = $state(false);
  let toast = $state('');
  let syncing = $state(false);
  let importing = $state(false);

  // Редактор публикаций
  let editingId = $state<number | null>(null);
  let postTitle = $state('');
  let postBody = $state('');
  let previewHtml = $state('');
  let showPreview = $state(false);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  function say(message: string) {
    toast = message;
    setTimeout(() => {
      if (toast === message) toast = '';
    }, 4000);
  }

  async function api(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) throw new Error(String(data.error ?? `HTTP ${res.status}`));
    return data;
  }

  async function toggleVisible(repo: RepoRow) {
    const next = repo.visible ? 0 : 1;
    repo.visible = next;
    try {
      await api('/admin/api/repos', 'POST', { id: repo.id, visible: !!next });
    } catch (e) {
      repo.visible = next ? 0 : 1;
      say(`Ошибка: ${e}`);
    }
  }

  async function toggleCategory(repo: RepoRow) {
    const next = repo.category === 'hard' ? 'vibe' : 'hard';
    const prev = repo.category;
    repo.category = next;
    try {
      await api('/admin/api/repos', 'POST', { id: repo.id, category: next });
    } catch (e) {
      repo.category = prev;
      say(`Ошибка: ${e}`);
    }
  }

  async function syncNow() {
    syncing = true;
    try {
      const r = await api('/admin/api/sync', 'POST');
      say(`Синк завершён: ${r.repos} репозиториев, ${r.imported} постов из TG`);
      location.reload();
    } catch (e) {
      say(`Ошибка синка: ${e}`);
    } finally {
      syncing = false;
    }
  }

  async function saveAbout() {
    try {
      await api('/admin/api/about', 'POST', about);
      say('Сохранено');
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  async function toggleAboutPreview() {
    showAboutPreview = !showAboutPreview;
    if (showAboutPreview) {
      try {
        const r = await api('/admin/api/preview', 'POST', { md: about.text });
        aboutPreviewHtml = String(r.html ?? '');
      } catch {
        /* превью не критично */
      }
    }
  }

  async function uploadAvatar() {
    const file = avatarFile?.[0];
    if (!file) {
      say('Выберите файл (PNG, JPEG или WebP)');
      return;
    }
    uploadingAvatar = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/admin/api/avatar', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) throw new Error(String(data.error ?? `HTTP ${res.status}`));
      avatarUrl = String(data.url);
      say('Фото обновлено');
    } catch (e) {
      say(`Ошибка загрузки: ${e}`);
    } finally {
      uploadingAvatar = false;
    }
  }

  async function deleteAvatar() {
    if (!confirm('Вернуть плейсхолдер вместо фото?')) return;
    try {
      await api('/admin/api/avatar', 'DELETE');
      avatarUrl = '/avatar.svg';
      say('Фото сброшено');
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      try {
        const r = await api('/admin/api/preview', 'POST', { md: postBody });
        previewHtml = String(r.html ?? '');
      } catch {
        /* превью не критично */
      }
    }, 400);
  }

  $effect(() => {
    void postBody;
    if (showPreview) schedulePreview();
  });

  function editPost(p: PostRow) {
    editingId = p.id;
    postTitle = p.title;
    postBody = p.bodyMd;
    tab = 'posts';
  }

  function resetEditor() {
    editingId = null;
    postTitle = '';
    postBody = '';
  }

  async function savePost(status: 'published' | 'draft') {
    if (!postTitle.trim()) {
      say('Введите заголовок');
      return;
    }
    try {
      if (editingId !== null) {
        await api(`/admin/api/posts/${editingId}`, 'PUT', { title: postTitle, bodyMd: postBody, status });
      } else {
        await api('/admin/api/posts', 'POST', { title: postTitle, bodyMd: postBody, status });
      }
      say(status === 'draft' ? 'Черновик сохранён' : 'Опубликовано');
      location.reload();
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  async function deletePost(p: PostRow) {
    if (!confirm(`Удалить «${p.title}»?`)) return;
    try {
      await api(`/admin/api/posts/${p.id}`, 'DELETE');
      posts = posts.filter((x) => x.id !== p.id);
      say('Удалено');
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  async function togglePostStatus(p: PostRow) {
    const next = p.status === 'published' ? 'draft' : 'published';
    try {
      await api(`/admin/api/posts/${p.id}`, 'PUT', { status: next });
      p.status = next;
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  async function importTelegram() {
    importing = true;
    try {
      const r = await api('/admin/api/telegram-import', 'POST');
      say(`Импортировано постов: ${r.imported}`);
      if (Number(r.imported) > 0) location.reload();
    } catch (e) {
      say(`Ошибка импорта: ${e}`);
    } finally {
      importing = false;
    }
  }

  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  function fmt(iso: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
  }
</script>

<div class="tabs">
  <button class="tab" class:active={tab === 'projects'} onclick={() => (tab = 'projects')}>Проекты GitHub</button>
  <button class="tab" class:active={tab === 'about'} onclick={() => (tab = 'about')}>Обо мне и ссылки</button>
  <button class="tab" class:active={tab === 'posts'} onclick={() => (tab = 'posts')}>Публикации</button>
</div>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

{#if tab === 'projects'}
  <section class="panel">
    <div class="panel-head">
      <h2>Репозитории</h2>
      <div class="head-right">
        <span class="hint">Последний синк: {fmt(lastSync)}</span>
        <button class="btn" onclick={syncNow} disabled={syncing}>
          {syncing ? 'Синхронизация…' : '⟳ Синхронизировать с GitHub'}
        </button>
      </div>
    </div>
    {#if repos.length === 0}
      <p class="hint">Репозиториев нет — проверьте GITHUB_USERNAME/GITHUB_TOKEN и запустите синк.</p>
    {/if}
    <div class="rows">
      {#each repos as repo (repo.id)}
        <div class="row" class:dim={!repo.visible}>
          <strong class="row-name">{repo.name}</strong>
          <span class="row-desc">{repo.description}</span>
          <button
            class="chip"
            class:chip-hard={repo.category === 'hard'}
            class:chip-vibe={repo.category === 'vibe'}
            onclick={() => toggleCategory(repo)}
            title="Переключить категорию"
          >
            {repo.category === 'hard' ? 'HARD CODE' : 'VIBE CODE'}
          </button>
          <button
            class="switch"
            class:on={!!repo.visible}
            role="switch"
            aria-checked={!!repo.visible}
            aria-label={`Показывать ${repo.name} на сайте`}
            onclick={() => toggleVisible(repo)}
          >
            <span class="knob"></span>
          </button>
        </div>
      {/each}
    </div>
  </section>
{:else if tab === 'about'}
  <section class="panel about">
    <div class="avatar-block">
      <img class="avatar-preview" src={avatarUrl} alt="Текущее фото" width="88" height="88" />
      <div class="avatar-controls">
        <label for="avatar-file">Фото на главной (PNG, JPEG или WebP, до 3 МБ)</label>
        <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" bind:files={avatarFile} />
        <div class="avatar-actions">
          <button class="btn" onclick={uploadAvatar} disabled={uploadingAvatar}>
            {uploadingAvatar ? 'Загрузка…' : '⤒ Загрузить фото'}
          </button>
          {#if avatarUrl !== '/avatar.svg'}
            <button class="btn" onclick={deleteAvatar}>Сбросить</button>
          {/if}
        </div>
      </div>
    </div>
    <div>
      <label for="about-text">Текст «обо мне» на главной · Markdown</label>
      <textarea id="about-text" rows="6" bind:value={about.text} placeholder={'# Всем, привет 👋\n\nПару слов о себе…'}
      ></textarea>
      <button class="btn btn-sm" onclick={toggleAboutPreview}>
        {showAboutPreview ? 'Скрыть превью' : 'Превью'}
      </button>
      {#if showAboutPreview}
        <div class="preview md-body">
          <!-- eslint-disable-next-line svelte/no-at-html-tags — HTML прошёл sanitize-html на сервере -->
          {@html aboutPreviewHtml || '<p>Пусто…</p>'}
        </div>
      {/if}
    </div>
    <div class="grid3">
      <div>
        <label for="link-tg">Telegram</label>
        <input id="link-tg" bind:value={about.telegram} placeholder="https://t.me/…" />
      </div>
      <div>
        <label for="link-yt">YouTube</label>
        <input id="link-yt" bind:value={about.youtube} placeholder="https://youtube.com/…" />
      </div>
      <div>
        <label for="link-gh">GitHub</label>
        <input id="link-gh" bind:value={about.github} placeholder="https://github.com/…" />
      </div>
    </div>
    <button class="btn btn-primary" onclick={saveAbout}>Сохранить</button>
  </section>
{:else}
  <section class="posts-grid">
    <div class="panel">
      <h2>{editingId !== null ? `Редактирование #${editingId}` : 'Новая публикация · Markdown'}</h2>
      <input class="post-title" bind:value={postTitle} placeholder="Заголовок" />
      <textarea class="post-body" rows="9" bind:value={postBody} placeholder="## Что нового…"></textarea>
      <div class="editor-actions">
        <button class="btn btn-primary" onclick={() => savePost('published')}>Опубликовать</button>
        <button class="btn" onclick={() => savePost('draft')}>Черновик</button>
        <button class="btn" onclick={() => (showPreview = !showPreview)}>
          {showPreview ? 'Скрыть превью' : 'Превью'}
        </button>
        {#if editingId !== null}
          <button class="btn" onclick={resetEditor}>Отмена</button>
        {/if}
      </div>
      {#if showPreview}
        <div class="preview md-body">
          <!-- eslint-disable-next-line svelte/no-at-html-tags — HTML прошёл sanitize-html на сервере -->
          {@html previewHtml || '<p class="hint">Начните печатать…</p>'}
        </div>
      {/if}
    </div>

    <div class="side">
      <div class="panel tg-panel">
        <h2>Telegram-канал</h2>
        <p class="hint">Импорт последних постов из канала как публикаций.</p>
        <button class="btn btn-tg" onclick={importTelegram} disabled={importing}>
          {importing ? 'Импорт…' : '↧ Парсить посты'}
        </button>
        <div class="hint small">
          Последний импорт: {tgLastImport ? `${fmt(tgLastImport.at)} · ${tgLastImport.count} пост(ов)` : 'ещё не было'}
        </div>
      </div>

      <div class="panel">
        <h2>Все публикации</h2>
        {#if posts.length === 0}
          <p class="hint">Пока нет публикаций.</p>
        {/if}
        <div class="rows">
          {#each posts as p (p.id)}
            <div class="row post-row">
              <span class="badge" class:badge-tg={p.source === 'telegram'}>
                {p.source === 'telegram' ? 'TG' : 'ADM'}
              </span>
              <span class="row-name post-name" class:dim={p.status === 'draft'}>{p.title}</span>
              <span class="hint small">{fmt(p.createdAt)}</span>
              <span class="post-actions">
                <button class="mini" onclick={() => togglePostStatus(p)} title="Опубликовать/в черновик">
                  {p.status === 'published' ? '👁' : '🌙'}
                </button>
                <button class="mini" onclick={() => editPost(p)} title="Редактировать">✎</button>
                <button class="mini danger" onclick={() => deletePost(p)} title="Удалить">✕</button>
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 24px;
    padding: 5px;
    max-width: 100%;
    border-radius: 22px;
    background: var(--glass-07);
    border: 1px solid var(--line-14);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    width: fit-content;
  }
  .tab {
    font: inherit;
    color: inherit;
    border: none;
    background: transparent;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    padding: 8px clamp(11px, 3vw, 18px);
    border-radius: 17px;
    transition: background 0.3s;
    cursor: pointer;
  }
  .tab.active {
    background: var(--active);
  }

  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    padding: 12px 22px;
    border-radius: 16px;
    background: rgba(20, 24, 40, 0.9);
    border: 1px solid var(--line-18);
    backdrop-filter: blur(16px);
    font-size: 14px;
    max-width: min(90vw, 480px);
  }

  .panel {
    border-radius: 28px;
    padding: clamp(16px, 4vw, 28px);
    background: var(--glass-05);
    border: 1px solid var(--line-13);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }
  .panel h2 {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 700;
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .panel-head h2 {
    margin: 0;
  }
  .head-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn {
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--fg);
    padding: 10px 18px;
    border-radius: 16px;
    background: var(--glass-08);
    border: 1px solid var(--line-15);
    cursor: pointer;
    transition: background 0.25s;
  }
  .btn:hover {
    background: var(--glass-10);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn-primary {
    color: var(--on-accent);
    background: var(--accent-grad);
    border: none;
    font-weight: 700;
  }
  .btn-primary:hover {
    background: var(--accent-grad);
    filter: brightness(1.06);
  }
  .btn-tg {
    color: #7cc0ef;
    background: rgba(42, 151, 225, 0.16);
    border-color: rgba(90, 170, 230, 0.4);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 14px;
    padding: 12px 16px;
    border-radius: 18px;
    background: var(--glass-05);
    border: 1px solid var(--line-12);
  }
  .row.dim .row-name,
  .row.dim .row-desc {
    opacity: 0.45;
  }
  .row-name {
    font-size: 14px;
    min-width: 150px;
  }
  .row-desc {
    flex: 1;
    min-width: min(160px, 100%);
    font-size: 13px;
    color: var(--fg-60);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip {
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    padding: 5px 12px;
    border-radius: 12px;
    flex: none;
    border: none;
    cursor: pointer;
    transition: filter 0.25s;
  }
  .chip:hover {
    filter: brightness(1.15);
  }
  .chip-hard {
    background: rgba(157, 183, 255, 0.2);
    color: #b8caff;
  }
  .chip-vibe {
    background: rgba(200, 140, 210, 0.25);
    color: #e2b7e8;
  }

  .switch {
    flex: none;
    width: 44px;
    height: 26px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.14);
    position: relative;
    transition: background 0.25s;
    border: 1px solid var(--line-15);
    cursor: pointer;
    padding: 0;
  }
  .switch.on {
    background: rgba(60, 200, 110, 0.55);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.25s;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .switch.on .knob {
    left: 20px;
  }

  .hint {
    font-size: 13px;
    color: var(--fg-50);
  }
  .hint.small {
    font-size: 12px;
  }
  .dim {
    opacity: 0.55;
  }

  .about {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .avatar-block {
    display: flex;
    gap: 18px;
    align-items: center;
    flex-wrap: wrap;
  }
  .avatar-preview {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--line-18);
    background: var(--glass-06);
    flex: none;
  }
  .avatar-controls {
    flex: 1;
    min-width: min(260px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .avatar-controls input[type='file'] {
    padding: 9px 12px;
    font-size: 13px;
  }
  .avatar-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn-sm {
    margin-top: 10px;
    padding: 8px 14px;
    font-size: 12.5px;
  }
  label {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg-60);
    margin-bottom: 8px;
  }
  textarea,
  input {
    width: 100%;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    color: var(--fg);
    padding: 12px 16px;
    border-radius: 16px;
    background: var(--input-bg);
    border: 1px solid var(--line-15);
    outline: none;
    box-sizing: border-box;
  }
  textarea:focus,
  input:focus {
    border-color: rgba(157, 183, 255, 0.5);
  }
  textarea {
    resize: vertical;
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
    gap: 14px;
  }
  .about .btn-primary {
    align-self: flex-start;
  }

  .posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: 20px;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .post-title {
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 12px;
  }
  .post-body {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 13px;
    line-height: 1.6;
  }
  .editor-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
  }
  .preview {
    margin-top: 16px;
    padding: 16px;
    border-radius: 16px;
    background: var(--input-bg);
    border: 1px solid var(--line-12);
  }

  .tg-panel {
    background: linear-gradient(145deg, rgba(42, 151, 225, 0.12), rgba(255, 255, 255, 0.05));
  }
  .tg-panel .hint {
    margin: 0 0 16px;
  }
  .tg-panel .hint.small {
    margin: 16px 0 0;
  }

  .post-row {
    gap: 8px 10px;
  }
  .post-name {
    flex: 1;
    min-width: min(140px, 100%);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 8px;
    background: rgba(157, 183, 255, 0.18);
    color: #b8caff;
    flex: none;
  }
  .badge-tg {
    background: rgba(42, 151, 225, 0.22);
    color: #7cc0ef;
  }
  .post-actions {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .mini {
    font: inherit;
    font-size: 13px;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--glass-08);
    border: 1px solid var(--line-14);
    color: var(--fg);
    cursor: pointer;
  }
  .mini:hover {
    background: var(--glass-10);
  }
  .mini.danger:hover {
    background: rgba(230, 80, 80, 0.3);
  }
</style>
