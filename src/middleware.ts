import { defineMiddleware } from 'astro:middleware';
import { config } from './lib/config';
import { checkBasicAuth } from './lib/auth';
import { startScheduler } from './lib/sync';
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANG_HINT_COOKIE,
  LANG_QUERY,
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
 *  - /admin* доступен ТОЛЬКО с хоста ADMIN_HOST (поддомен, например admin.example.com)
 *    и закрыт Basic Auth; с любого другого хоста — 404, как будто страницы нет.
 *  - На админ-хосте публичные страницы не отдаются: всё, кроме статики и API,
 *    редиректится на /admin.
 *
 * Плюс языковой роутинг публичной части: /en/* — английская версия, всё
 * остальное русская. Подробности в src/lib/i18n/index.ts.
 *
 * Язык браузера страницу не подменяет: по рекомендации Google сайт не
 * редиректит автоматически по Accept-Language (такой редирект мешает и
 * посетителю, и роботу увидеть остальные версии, и стоит лишнего похода на
 * сервер перед первой отрисовкой). Вместо этого страница показывает ссылку
 * на другую версию — см. src/components/LangHint.astro. Редирект остаётся
 * только там, где язык выбрал сам посетитель: ?hl= и запомненная им кука.
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

  const cookieRaw = context.cookies.get(LANG_COOKIE)?.value ?? '';
  const chosenLang = isLang(cookieRaw) ? cookieRaw : null;
  const isPage = !isNonPageRequest(cleanPath);

  // Выбранный ранее язык уважаем: посетитель нажал переключатель, и по «чистому»
  // адресу его возвращаем в ту же версию. Это его решение, а не догадка по заголовку.
  if (isPage && pathLang === DEFAULT_LANG && chosenLang && chosenLang !== DEFAULT_LANG) {
    return context.redirect(`${localePath(cleanPath, chosenLang)}${context.url.search}`, 302);
  }

  // Заголовок Accept-Language только подсказывает, что предложить ссылкой.
  // Пустого заголовка достаточно, чтобы промолчать: так поисковые роботы,
  // которые его обычно не шлют, получают страницу без баннера — и никакого
  // определения робота по User-Agent для этого не нужно.
  const acceptLanguage = context.request.headers.get('accept-language');
  const dismissed = context.cookies.get(LANG_HINT_COOKIE)?.value === '0';
  const preferred = acceptLanguage ? langFromAcceptLanguage(acceptLanguage) : null;

  context.locals.lang = pathLang;
  context.locals.path = cleanPath;
  context.locals.suggestLang =
    isPage && !chosenLang && !dismissed && preferred && preferred !== pathLang ? preferred : null;

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
