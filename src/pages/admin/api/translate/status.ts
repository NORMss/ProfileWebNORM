import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../../../../lib/queries';
import {
  activeProvider,
  allProviders,
  apiBlockReason,
  autoTranslateOnPublish,
  countTranslations,
  currentMonth,
  getLastError,
  getUsage,
  getUsageHistory,
  lazyTranslateOnView,
  monthlyLimit,
} from '../../../../lib/translate';
import { postCharCost, postTranslationState } from '../../../../lib/translate/content';
import { config } from '../../../../lib/config';
import { indexNowConfigured } from '../../../../lib/indexnow';

/**
 * Состояние автоперевода для админки: какой провайдер активен, сколько
 * символов месячного лимита израсходовано, что переведено, где ошибка.
 */
export const GET: APIRoute = async () => {
  const provider = activeProvider();
  const limit = monthlyLimit(provider);
  const usage = getUsage();

  // У DeepL есть эндпоинт реального расхода — показываем его рядом с локальным счётчиком
  let remote: { used: number; limit: number } | null = null;
  let remoteError: string | null = null;
  if (provider.remoteUsage) {
    try {
      remote = await provider.remoteUsage();
    } catch (e) {
      remoteError = e instanceof Error ? e.message : String(e);
    }
  }

  const posts = getPublishedPosts().map((post) => ({
    id: post.id,
    title: post.title,
    createdAt: post.createdAt,
    state: postTranslationState(post),
    chars: postCharCost(post),
  }));
  const pending = posts.filter((p) => p.state !== 'ready');

  return Response.json({
    ok: true,
    month: currentMonth(),
    provider: {
      id: provider.id,
      label: provider.label,
      configured: provider.configured,
      consoleUrl: provider.consoleUrl,
      freeMonthlyChars: provider.freeMonthlyChars,
    },
    providers: allProviders().map((p) => ({
      id: p.id,
      label: p.label,
      configured: p.configured,
      freeMonthlyChars: p.freeMonthlyChars,
      consoleUrl: p.consoleUrl,
    })),
    forced: config.translateProvider || null,
    usage: { used: usage.chars, limit, requests: usage.requests, errors: usage.errors },
    remote,
    remoteError,
    history: getUsageHistory(6),
    cached: countTranslations('en'),
    lastError: getLastError(),
    blocked: apiBlockReason(),
    flags: { auto: autoTranslateOnPublish(), lazy: lazyTranslateOnView() },
    posts,
    pending: { count: pending.length, chars: pending.reduce((sum, p) => sum + p.chars, 0) },
    indexNow: indexNowConfigured(),
  });
};
