/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Язык страницы, определённый middleware по префиксу пути (/en) или Accept-Language. */
    lang: import('./lib/i18n').Lang;
    /** Путь без языкового префикса — основа для canonical, hreflang и переключателя языка. */
    path: string;
    /**
     * Язык, который стоит предложить посетителю ссылкой: браузер просит не тот,
     * что открыт, а выбор он ещё не делал. null — предлагать нечего.
     */
    suggestLang: import('./lib/i18n').Lang | null;
  }
}
