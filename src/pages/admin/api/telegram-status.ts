import type { APIRoute } from 'astro';
import { getTelegramStatus } from '../../../lib/telegram';

/** Диагностика бота: getMe + getWebhookInfo — чтобы понять, почему импорт «не видит» посты. */
export const GET: APIRoute = async () => {
  return Response.json(await getTelegramStatus());
};
