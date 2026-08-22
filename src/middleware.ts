import { defineMiddleware } from 'astro:middleware';
import { config } from './lib/config';
import { checkBasicAuth } from './lib/auth';
import { startScheduler } from './lib/sync';
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANG_QUERY,
  isCrawler,
  isLang,
  isNonPageRequest,
  langFromAcceptLanguage,
  localePath,
  splitLangPath,
} from './lib/i18n';

// Модуль middleware загружается один раз при старте сервера — здесь же поднимаем cron-синк.
startScheduler();

/**
 * Разделение публичного сайта и админки по хостам:
 *  - /admin* доступен ТОЛЬКО с хоста ADMIN_HOST (поддомен, например admin.normno.com)
 *    и закрыт Basic Auth; с любого другого хоста — 404, как будто страницы нет.
 *  - На админ-хосте публичные страницы не отдаются: всё, кроме статики и API,
 *    редиректится на /admin.
 *
 * Плюс языковой роутинг публичной части: /en/* — английская версия, всё
 * остальное русская. Подробности в src/lib/i18n/index.ts.
 */
export const onRequest = defineMiddleware(async (context, next) => {
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
    context.locals.lang = DEFAULT_LANG;
    context.locals.path = path;
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
      context.locals.lang = DEFAULT_LANG;
      context.locals.path = path;
      return next();
    }
    return context.redirect('/admin', 302);
  }

  const { lang: pathLang, path: cleanPath } = splitLangPath(path);

  // ?hl=en — явный выбор языка ссылкой-переключателем: запоминаем в куки
  // и уводим на «чистый» URL нужной версии (без query-мусора в индексе).
  const requested = context.url.searchParams.get(LANG_QUERY);
  if (requested !== null) {
    const target = isLang(requested) ? requested : DEFAULT_LANG;
    const search = new URLSearchParams(context.url.search);
    search.delete(LANG_QUERY);
    const rest = search.toString();
    context.cookies.set(LANG_COOKIE, target, {
      path: '/',
      maxAge: LANG_COOKIE_MAX_AGE,
      sameSite: 'lax',
      httpOnly: false,
    });
    return context.redirect(`${localePath(cleanPath, target)}${rest ? `?${rest}` : ''}`, 302);
  }

  // Автоопределение языка — только для «чистых» русских URL и живых посетителей:
  // роботам отдаём ровно запрошенную версию, иначе русская главная не попадёт в индекс.
  if (pathLang === DEFAULT_LANG && !isNonPageRequest(cleanPath)) {
    const cookieLang = context.cookies.get(LANG_COOKIE)?.value ?? '';
    const preferred = isLang(cookieLang)
      ? cookieLang
      : langFromAcceptLanguage(context.request.headers.get('accept-language'));
    const bot = isCrawler(context.request.headers.get('user-agent'));
    if (!bot && preferred !== DEFAULT_LANG) {
      return context.redirect(`${localePath(cleanPath, preferred)}${context.url.search}`, 302);
    }
  }

  context.locals.lang = pathLang;
  context.locals.path = cleanPath;

  const response =
    pathLang === DEFAULT_LANG ? await next() : await next(new URL(`${cleanPath}${context.url.search}`, context.url));

  // Ответ зависит от языка браузера и куки — говорим это кешам явно.
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    const vary = response.headers.get('vary');
    response.headers.set('Vary', vary ? `${vary}, Accept-Language, Cookie` : 'Accept-Language, Cookie');
  }
  return response;
});
