<script lang="ts">
  interface RepoRow {
    id: number;
    name: string;
    fullName: string;
    description: string;
    category: string;
    visible: number;
    imageUrl: string;
    readmeImages: string[];
  }
  interface PostRow {
    id: number;
    title: string;
    bodyMd: string;
    source: string;
    status: string;
    createdAt: string;
    tgMessageId: number | null;
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
    projectsSort: initialProjectsSort,
    spotify,
    lastSync,
    tgLastImport,
  } = $props<{
    repos: RepoRow[];
    posts: PostRow[];
    about: About;
    avatarUrl: string;
    projectsSort: string;
    spotify: { appConfigured: boolean; connected: boolean; redirectUri: string };
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

  // Редактор обложки проекта
  let coverOpenId = $state<number | null>(null);
  let coverFile = $state<FileList | null>(null);
  let uploadingCover = $state(false);
  let sendToTelegram = $state(false);
  let sendingTgId = $state<number | null>(null);

  let projectsSort = $state(initialProjectsSort);

  async function saveProjectsSort() {
    try {
      await api('/admin/api/settings', 'POST', { projects_sort: projectsSort });
      say('Сортировка по умолчанию сохранена');
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  function ogImage(repo: RepoRow) {
    return `https://opengraph.githubassets.com/1/${repo.fullName}`;
  }
  function coverPreview(repo: RepoRow) {
    return repo.imageUrl || ogImage(repo);
  }

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
        const r = await api(`/admin/api/posts/${editingId}`, 'PUT', { title: postTitle, bodyMd: postBody, status });
        if (r.telegramError) {
          alert(`Пост обновлён на сайте, но сообщение в Telegram обновить не удалось:\n${r.telegramError}`);
        } else {
          say(status === 'draft' ? 'Черновик сохранён' : 'Опубликовано');
        }
      } else {
        const r = await api('/admin/api/posts', 'POST', {
          title: postTitle,
          bodyMd: postBody,
          status,
          sendToTelegram: sendToTelegram && status === 'published',
        });
        if (r.telegramError) {
          alert(`Пост опубликован на сайте, но не отправлен в Telegram:\n${r.telegramError}`);
        } else {
          say(status === 'draft' ? 'Черновик сохранён' : 'Опубликовано');
        }
      }
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

  async function chooseCover(repo: RepoRow, imageUrl: string) {
    try {
      const r = await api('/admin/api/repo-cover', 'PUT', { id: repo.id, imageUrl });
      repo.imageUrl = String(r.imageUrl ?? '');
      say(imageUrl === '' ? 'Обложка: og-image GitHub' : 'Обложка выбрана из README');
    } catch (e) {
      say(`Ошибка: ${e}`);
    }
  }

  async function uploadCover(repo: RepoRow) {
    const file = coverFile?.[0];
    if (!file) {
      say('Выберите файл (PNG, JPEG или WebP)');
      return;
    }
    uploadingCover = true;
    try {
      const fd = new FormData();
      fd.append('id', String(repo.id));
      fd.append('file', file);
      const res = await fetch('/admin/api/repo-cover', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) throw new Error(String(data.error ?? `HTTP ${res.status}`));
      repo.imageUrl = String(data.imageUrl);
      coverFile = null;
      say('Своя обложка загружена');
    } catch (e) {
      say(`Ошибка загрузки: ${e}`);
    } finally {
      uploadingCover = false;
    }
  }

  async function sendPostTg(p: PostRow) {
    sendingTgId = p.id;
    try {
      const r = await api('/admin/api/telegram-send', 'POST', { postId: p.id });
      p.tgMessageId = Number(r.messageId);
      say('Пост опубликован в Telegram');
    } catch (e) {
      say(`Ошибка отправки в TG: ${e}`);
    } finally {
      sendingTgId = null;
    }
  }

  // Вставка загруженной картинки в markdown поста (в позицию курсора)
  let postBodyEl = $state<HTMLTextAreaElement | null>(null);
  let postImageInput = $state<HTMLInputElement | null>(null);
  let uploadingImage = $state(false);

  async function uploadPostImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadingImage = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/admin/api/post-image', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) throw new Error(String(data.error ?? `HTTP ${res.status}`));
      const snippet = String(data.markdown);
      const pos = postBodyEl?.selectionStart ?? postBody.length;
      postBody = postBody.slice(0, pos) + `\n${snippet}\n` + postBody.slice(pos);
      say('Картинка добавлена в текст');
    } catch (err) {
      say(`Ошибка загрузки: ${err}`);
    } finally {
      uploadingImage = false;
      input.value = '';
    }
  }

  // Диагностика Telegram-бота
  interface TgStatus {
    configured: boolean;
    bot?: { username: string };
    webhookUrl?: string;
    pendingUpdates?: number;
    lastErrorMessage?: string;
    channel?: string;
    error?: string;
  }
  let tgStatus = $state<TgStatus | null>(null);
  let tgStatusLoading = $state(false);

  async function checkTgStatus() {
    tgStatusLoading = true;
    try {
      const res = await fetch('/admin/api/telegram-status');
      tgStatus = (await res.json()) as TgStatus;
    } catch (e) {
      tgStatus = { configured: false, error: String(e) };
    } finally {
      tgStatusLoading = false;
    }
  }

  let backingUp = $state(false);

  // Массовое удаление постов
  let selectedIds = $state(new Set<number>());
  let bulkDeleting = $state(false);

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    selectedIds = selectedIds.size === posts.length ? new Set() : new Set(posts.map((p) => p.id));
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Удалить выбранные посты (${ids.length} шт.)? Это действие необратимо.`)) return;
    bulkDeleting = true;
    try {
      const r = await api('/admin/api/posts/bulk-delete', 'POST', { ids });
      posts = posts.filter((p) => !selectedIds.has(p.id));
      selectedIds = new Set();
      say(`Удалено постов: ${r.deleted}`);
    } catch (e) {
      say(`Ошибка удаления: ${e}`);
    } finally {
      bulkDeleting = false;
    }
  }

  async function backupNow() {
    backingUp = true;
    try {
      const r = await api('/admin/api/backup', 'POST');
      say(`Бэкап отправлен в Telegram: ${r.fileName} (${r.sizeKb} КБ)`);
    } catch (e) {
      say(`Ошибка бэкапа: ${e}`);
    } finally {
      backingUp = false;
    }
  }

  async function importTelegram() {
    importing = true;
    try {
      const r = await api('/admin/api/telegram-import', 'POST');
      say(`Импортировано: ${r.imported}, обновлено: ${r.updated ?? 0}`);
      if (Number(r.imported) > 0 || Number(r.updated) > 0) location.reload();
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
    <label class="sort-default">
      Сортировка проектов по умолчанию:
      <select bind:value={projectsSort} onchange={saveProjectsSort}>
        <option value="released">Сначала новые релизы</option>
        <option value="downloads">По загрузкам</option>
        <option value="stars">По звёздам</option>
      </select>
    </label>
    {#if repos.length === 0}
      <p class="hint">Репозиториев нет — проверьте GITHUB_USERNAME/GITHUB_TOKEN и запустите синк.</p>
    {/if}
    <div class="rows">
      {#each repos as repo (repo.id)}
        <div class="row-wrap glass-item" class:dim={!repo.visible}>
          <div class="row row-flat">
            <button
              class="cover-thumb"
              title="Обложка проекта"
              onclick={() => {
                coverOpenId = coverOpenId === repo.id ? null : repo.id;
                coverFile = null;
              }}
            >
              <img src={coverPreview(repo)} alt="" loading="lazy" />
              <span class="cover-edit">✎</span>
            </button>
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

          {#if coverOpenId === repo.id}
            <div class="cover-editor">
              <div class="cover-label">
                Обложка: og-image GitHub, картинка из README или своя (файл хранится на сервере только для своей)
              </div>
              <div class="cover-grid">
                <button
                  class="cover-option"
                  class:selected={repo.imageUrl === ''}
                  onclick={() => chooseCover(repo, '')}
                  title="og-image GitHub (по умолчанию)"
                >
                  <img src={ogImage(repo)} alt="og-image" loading="lazy" />
                  <span>og-image</span>
                </button>
                {#each repo.readmeImages as img (img)}
                  <button
                    class="cover-option"
                    class:selected={repo.imageUrl === img}
                    onclick={() => chooseCover(repo, img)}
                    title={img}
                  >
                    <img src={img} alt="Из README" loading="lazy" />
                    <span>README</span>
                  </button>
                {/each}
              </div>
              {#if repo.readmeImages.length === 0}
                <div class="hint small">В README картинок не найдено (обновляется при синке).</div>
              {/if}
              <div class="cover-upload">
                <input type="file" accept="image/png,image/jpeg,image/webp" bind:files={coverFile} />
                <button class="btn" onclick={() => uploadCover(repo)} disabled={uploadingCover}>
                  {uploadingCover ? 'Загрузка…' : '⤒ Своя обложка'}
                </button>
              </div>
            </div>
          {/if}
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

    <div class="spotify-block">
      <div class="spotify-title">
        Spotify · виджет «сейчас играет»
        <span class="chip" class:chip-on={spotify.connected}>
          {spotify.connected ? 'подключён' : 'не подключён'}
        </span>
      </div>
      {#if spotify.appConfigured}
        <a class="btn btn-spotify" href="/admin/spotify/login">
          {spotify.connected ? '↻ Переподключить' : '♫ Подключить Spotify'}
        </a>
        <div class="hint small">
          В настройках приложения на developer.spotify.com должен быть добавлен Redirect URI:
          <code>{spotify.redirectUri}</code>
        </div>
      {:else}
        <div class="hint small">Задайте SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET в .env и перезапустите приложение.</div>
      {/if}
    </div>
  </section>
{:else}
  <section class="posts-grid">
    <div class="panel">
      <h2>{editingId !== null ? `Редактирование #${editingId}` : 'Новая публикация · Markdown'}</h2>
      <input class="post-title" bind:value={postTitle} placeholder="Заголовок" />
      <textarea class="post-body" rows="9" bind:value={postBody} bind:this={postBodyEl} placeholder="## Что нового…"
      ></textarea>
      <div class="image-row">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          bind:this={postImageInput}
          onchange={uploadPostImage}
          hidden
        />
        <button class="btn btn-sm" onclick={() => postImageInput?.click()} disabled={uploadingImage}>
          {uploadingImage ? 'Загрузка…' : '🖼 Прикрепить фото'}
        </button>
        <span class="hint small">…или вставьте в текст markdown-ссылку: ![](https://…)</span>
      </div>
      {#if editingId === null}
        <label class="tg-check">
          <input type="checkbox" bind:checked={sendToTelegram} />
          Сразу отправить в Telegram-канал
        </label>
      {/if}
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
        <div class="tg-actions">
          <button class="btn btn-tg" onclick={importTelegram} disabled={importing}>
            {importing ? 'Импорт…' : '↧ Парсить посты'}
          </button>
          <button class="btn btn-sm" onclick={checkTgStatus} disabled={tgStatusLoading}>
            {tgStatusLoading ? 'Проверка…' : '🔍 Диагностика'}
          </button>
          <button class="btn btn-sm" onclick={backupNow} disabled={backingUp} title="Архив БД и загруженных файлов — в личный чат с ботом">
            {backingUp ? 'Бэкап…' : '💾 Бэкап в Telegram'}
          </button>
        </div>
        <div class="hint small">
          Последний импорт: {tgLastImport ? `${fmt(tgLastImport.at)} · ${tgLastImport.count} пост(ов)` : 'ещё не было'}
        </div>
        {#if tgStatus}
          <div class="tg-status">
            {#if tgStatus.error}
              <div class="tg-bad">⚠ {tgStatus.error}</div>
            {:else}
              <div>Бот: <b>@{tgStatus.bot?.username}</b> · канал: <b>{tgStatus.channel}</b></div>
              {#if tgStatus.webhookUrl}
                <div class="tg-bad">
                  ⚠ Установлен webhook ({tgStatus.webhookUrl}) — getUpdates не работает, пока он не снят
                  (см. docs/TELEGRAM.md)
                </div>
              {:else}
                <div>Webhook не установлен ✓ · непрочитанных апдейтов: {tgStatus.pendingUpdates}</div>
              {/if}
              {#if tgStatus.lastErrorMessage}
                <div class="tg-bad">Последняя ошибка Telegram: {tgStatus.lastErrorMessage}</div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Все публикации</h2>
          {#if posts.length > 0}
            <div class="bulk-bar">
              <label class="bulk-all">
                <input
                  type="checkbox"
                  checked={selectedIds.size === posts.length && posts.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < posts.length}
                  onchange={toggleSelectAll}
                />
                все
              </label>
              {#if selectedIds.size > 0}
                <button class="btn btn-sm btn-danger" onclick={bulkDelete} disabled={bulkDeleting}>
                  {bulkDeleting ? 'Удаление…' : `✕ Удалить (${selectedIds.size})`}
                </button>
              {/if}
            </div>
          {/if}
        </div>
        {#if posts.length === 0}
          <p class="hint">Пока нет публикаций.</p>
        {/if}
        <div class="rows">
          {#each posts as p (p.id)}
            <div class="row post-row" class:selected={selectedIds.has(p.id)}>
              <input
                class="post-check"
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onchange={() => toggleSelect(p.id)}
                aria-label={`Выбрать «${p.title}»`}
              />
              <span class="badge" class:badge-tg={p.source === 'telegram'}>
                {p.source === 'telegram' ? 'TG' : 'ADM'}
              </span>
              <span class="row-name post-name" class:dim={p.status === 'draft'}>{p.title}</span>
              <span class="hint small">{fmt(p.createdAt)}</span>
              <span class="post-actions">
                {#if p.status === 'published' && p.source === 'admin' && !p.tgMessageId}
                  <button
                    class="mini"
                    onclick={() => sendPostTg(p)}
                    disabled={sendingTgId === p.id}
                    title="Отправить в Telegram-канал"
                  >
                    {sendingTgId === p.id ? '…' : '📨'}
                  </button>
                {/if}
                {#if p.tgMessageId}
                  <span class="mini tg-done" title="Синхронизировано с Telegram-каналом">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path
                        d="M19.7773,4.42984 C20.8652,3.97177 22.0315,4.8917 21.8394,6.05639 L19.5705,19.8131 C19.3517,21.1395 17.8949,21.9006 16.678,21.2396 C15.6597,20.6865 14.1489,19.8352 12.7873,18.9455 C12.1074,18.5012 10.0255,17.0766 10.2814,16.0625 C10.5002,15.1954 14.0001,11.9375 16.0001,10 C16.7857,9.23893 16.4279,8.79926 15.5001,9.5 C13.1985,11.2383 9.50332,13.8812 8.28136,14.625 C7.20323,15.2812 6.64031,15.3932 5.96886,15.2812 C4.74273,15.0769 3.60596,14.7605 2.67788,14.3758 C1.42351,13.8558 1.48461,12.132 2.67703,11.63 L19.7773,4.42984 Z"
                      />
                    </svg>
                  </span>
                {/if}
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
    background: var(--toast-bg);
    color: var(--fg);
    border: 1px solid var(--line-18);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: var(--shadow-md);
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
    color: var(--badge-tg-fg);
    background: var(--badge-tg-bg);
    border-color: var(--tint-tg-line);
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
  .sort-default {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--fg-60);
  }
  .sort-default select {
    width: auto;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--input-bg);
    border: 1px solid var(--line-15);
    outline: none;
    cursor: pointer;
  }
  .sort-default option {
    color: #1a1a1a;
  }
  .row-wrap {
    border-radius: 18px;
  }
  .row-flat {
    background: none;
    border: none;
  }
  .row-wrap.dim .row-name,
  .row-wrap.dim .row-desc,
  .row-wrap.dim .cover-thumb {
    opacity: 0.45;
  }
  .cover-thumb {
    position: relative;
    width: 56px;
    height: 42px;
    flex: none;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--line-15);
    background: var(--glass-06);
    padding: 0;
    cursor: pointer;
  }
  .cover-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-edit {
    position: absolute;
    right: 2px;
    bottom: 2px;
    font-size: 11px;
    line-height: 1;
    padding: 3px;
    border-radius: 6px;
    background: var(--toast-bg);
    color: var(--fg);
  }
  .cover-editor {
    padding: 0 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cover-label {
    font-size: 12px;
    color: var(--fg-50);
  }
  .cover-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .cover-option {
    width: 108px;
    border: 2px solid var(--line-14);
    border-radius: 12px;
    overflow: hidden;
    background: var(--glass-05);
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }
  .cover-option img {
    width: 100%;
    height: 64px;
    object-fit: cover;
    display: block;
  }
  .cover-option span {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--fg-55);
    padding: 4px 0;
    text-align: center;
  }
  .cover-option.selected {
    border-color: var(--green);
  }
  .cover-option.selected span {
    color: var(--green);
  }
  .cover-upload {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .cover-upload input[type='file'] {
    flex: 1;
    min-width: min(220px, 100%);
    padding: 8px 12px;
    font-size: 12.5px;
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
    background: var(--badge-admin-bg);
    color: var(--badge-admin-fg);
  }
  .chip-vibe {
    background: var(--chip-vibe-bg);
    color: var(--chip-vibe-fg);
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
  .spotify-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding-top: 18px;
    border-top: 1px solid var(--line-12);
  }
  .spotify-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 600;
    color: var(--fg-60);
  }
  .chip {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 10px;
    background: var(--glass-08);
    color: var(--fg-55);
  }
  .chip-on {
    background: rgba(30, 215, 96, 0.2);
    color: #1ed760;
  }
  .btn-spotify {
    text-decoration: none;
    color: #1ed760;
    background: rgba(30, 215, 96, 0.16);
    border-color: rgba(30, 215, 96, 0.4);
  }
  .spotify-block code {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    background: var(--code-bg);
    padding: 2px 6px;
    border-radius: 6px;
    overflow-wrap: anywhere;
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
  .tg-check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 13px;
    color: var(--fg-60);
    cursor: pointer;
  }
  .tg-check input {
    width: auto;
    accent-color: #2a97e1;
  }
  .editor-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
  }
  .tg-done {
    color: #2a97e1;
    background: var(--badge-tg-bg);
    border: none;
    cursor: default;
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
  .tg-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tg-status {
    margin-top: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--input-bg);
    border: 1px solid var(--line-12);
    font-size: 12.5px;
    color: var(--fg-60);
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-wrap: anywhere;
  }
  .tg-bad {
    color: #e8a06a;
  }
  .image-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .image-row .btn-sm {
    margin-top: 0;
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
  .post-row.selected {
    border-color: rgba(230, 100, 100, 0.5);
  }
  .post-check {
    width: 17px;
    height: 17px;
    flex: none;
    accent-color: #e05c5c;
    cursor: pointer;
  }
  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .bulk-all {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--fg-55);
    cursor: pointer;
  }
  .bulk-all input {
    width: 16px;
    height: 16px;
    accent-color: #e05c5c;
    cursor: pointer;
  }
  .btn-danger {
    color: #ff9c9c;
    background: rgba(230, 80, 80, 0.18);
    border-color: rgba(230, 100, 100, 0.4);
  }
  .btn-danger:hover {
    background: rgba(230, 80, 80, 0.3);
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
