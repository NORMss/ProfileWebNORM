import { defineMiddleware } from 'astro:middleware';
import { config } from './lib/config';
import { checkBasicAuth } from './lib/auth';
import { startScheduler } from './lib/sync';

// Модуль middleware загружается один раз при старте сервера — здесь же поднимаем cron-синк.
startScheduler();

/**
 * Разделение публичного сайта и админки по хостам:
 *  - /admin* доступен ТОЛЬКО с хоста ADMIN_HOST (поддомен, например admin.normno.com)
 *    и закрыт Basic Auth; с любого другого хоста — 404, как будто страницы нет.
 *  - На админ-хосте публичные страницы не отдаются: всё, кроме статики и API,
 *    редиректится на /admin.
 */
export const onRequest = defineMiddleware((context, next) => {
  const host = (context.request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const adminHost = config.adminHost.toLowerCase();
  const isAdminHost = host === adminHost;
  const path = context.url.pathname;
  const isAdminPath = path === '/admin' || path.startsWith('/admin/');

  if (isAdminPath) {
    if (!isAdminHost) return new Response('Not found', { status: 404 });
    const denied = checkBasicAuth(context.request);
    if (denied) return denied;

    // CSRF: браузер всегда шлёт Origin на POST/PUT/DELETE — хост должен совпадать
    // с хостом запроса (схему не сравниваем: за Caddy приложение видит http).
    const method = context.request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = context.request.headers.get('origin');
      if (origin) {
        let originHost = '';
        try {
          originHost = new URL(origin).hostname.toLowerCase();
        } catch {
          originHost = '';
        }
        if (originHost !== host) {
          return Response.json({ ok: false, error: 'Origin не совпадает с хостом' }, { status: 403 });
        }
      }
    }
    return next();
  }

  if (isAdminHost) {
    if (
      path.startsWith('/_astro/') ||
      path.startsWith('/api/') ||
      path.startsWith('/media/') ||
      path === '/favicon.svg' ||
      path === '/avatar.svg' ||
      path === '/robots.txt'
    ) {
      return next();
    }
    return context.redirect('/admin', 302);
  }

  return next();
});
