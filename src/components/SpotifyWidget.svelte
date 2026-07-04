<script lang="ts">
  import { onMount } from 'svelte';

  interface Track {
    title: string;
    artist: string;
    coverUrl: string;
    url: string;
    progressMs: number;
    durationMs: number;
  }
  interface NowPlaying {
    configured: boolean;
    playing: boolean;
    track: Track | null;
  }

  let { initial } = $props<{ initial: NowPlaying }>();

  let data = $state<NowPlaying>(initial);

  const progress = $derived(
    data.track && data.track.durationMs > 0
      ? Math.min(100, (data.track.progressMs / data.track.durationMs) * 100)
      : 0,
  );

  onMount(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/now-playing');
        if (res.ok) data = await res.json();
      } catch {
        /* сеть моргнула — покажем прошлые данные */
      }
    };
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  });
</script>

{#if data.track}
  <section class="spotify" class:playing={data.playing}>
    <div class="head">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path
            d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.83-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.33-1.46c4.56-1.04 8.48-.6 11.7 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.18-2.57-12-1.4a.94.94 0 1 1-.55-1.8c4.37-1.32 9.8-.68 13.53 1.6.44.27.58.85.31 1.29zm.13-3.4C15.24 8.32 8.84 8.11 5.13 9.24a1.13 1.13 0 1 1-.65-2.16c4.26-1.29 11.33-1.04 15.8 1.61a1.13 1.13 0 0 1-1.18 1.94z"
          />
        </svg>
      </span>
      <span class="label">{data.playing ? 'СЕЙЧАС ИГРАЕТ' : 'НЕДАВНО ИГРАЛО'}</span>
      {#if data.playing}
        <span class="eq" aria-hidden="true">
          {#each [0, 1, 2, 3] as i}
            <span class="eq-bar" style={`animation-duration:${0.7 + i * 0.13}s;animation-delay:${i * 0.1}s`}></span>
          {/each}
        </span>
      {/if}
    </div>
    <a class="track" href={data.track.url} target="_blank" rel="noopener noreferrer" data-ripple>
      {#if data.track.coverUrl}
        <img class="cover" src={data.track.coverUrl} alt="Обложка альбома" width="72" height="72" loading="lazy" />
      {:else}
        <div class="cover cover-empty">cover</div>
      {/if}
      <div class="meta">
        <div class="title">{data.track.title}</div>
        <div class="artist">{data.track.artist}</div>
        {#if data.playing && data.track.durationMs > 0}
          <div class="bar"><div class="fill" style={`width:${progress}%`}></div></div>
        {/if}
      </div>
    </a>
  </section>
{/if}

<style>
  .spotify {
    flex: 1 1 300px;
    min-width: min(280px, 100%);
    border-radius: 28px;
    padding: clamp(18px, 4vw, 24px);
    background: linear-gradient(145deg, rgba(30, 215, 96, 0.13), rgba(255, 255, 255, 0.05));
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    box-shadow: var(--shadow-md);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .logo {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--spotify);
    color: #07080f;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--green);
    letter-spacing: 0.4px;
  }
  .eq {
    display: flex;
    gap: 2.5px;
    align-items: flex-end;
    height: 14px;
    margin-left: auto;
  }
  .eq-bar {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: var(--spotify);
    transform-origin: bottom;
    animation: eq 0.8s ease-in-out infinite;
  }
  .track {
    display: flex;
    gap: 14px;
    align-items: center;
    text-decoration: none;
    border-radius: 16px;
  }
  .cover {
    width: 72px;
    height: 72px;
    flex: none;
    border-radius: 16px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.14);
  }
  .cover-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9px;
    color: var(--fg-55);
    background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.09) 0 7px, rgba(255, 255, 255, 0.03) 7px 14px);
  }
  .meta {
    min-width: 0;
  }
  .title {
    font-size: 15.5px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist {
    font-size: 13px;
    color: var(--fg-60);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    margin-top: 10px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    width: 100%;
    max-width: 170px;
  }
  .fill {
    height: 4px;
    border-radius: 2px;
    background: var(--spotify);
  }
</style>
