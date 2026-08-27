/**
 * WebMCP — инструменты страницы для ИИ-агентов.
 *
 * Агент, который открыл сайт в браузере с поддержкой Model Context (Chrome и
 * другие, где есть navigator.modelContext / document.modelContext), получает
 * не «страницу для разбора глазами», а набор именованных инструментов: список
 * проектов, конкретный проект с релизами, публикации, поиск. Под капотом это
 * те же JSON-эндпоинты /api/agent/*, что доступны и обычным HTTP-клиентам.
 *
 * Файл намеренно лежит в public/ и подключается динамическим import() из
 * Base.astro только при наличии API: в обычном браузере он не скачивается
 * вовсе и ничего не стоит ни трафику, ни главному потоку.
 */

const ctx = navigator.modelContext || document.modelContext;
if (ctx) {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'ru';

  /** Ответ инструмента в формате MCP: текст для модели плюс исходный объект. */
  const result = (data) => ({
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    structuredContent: typeof data === 'string' ? undefined : data,
  });

  const fail = (message) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
  });

  /** Запрос к машинному API сайта; язык подставляется по языку открытой страницы. */
  const api = async (path, params = {}) => {
    const url = new URL(path, location.origin);
    url.searchParams.set('lang', lang);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };

  /** Разные редакции спецификации передают аргументы по-разному — принимаем оба. */
  const argsOf = (input) => (input && typeof input === 'object' && input.arguments ? input.arguments : input) || {};

  const wrap = (run) => async (input) => {
    try {
      return result(await run(argsOf(input)));
    } catch (e) {
      return fail(`Не удалось получить данные: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const tools = [
    {
      name: 'get_site_overview',
      description:
        'Обзор сайта: кто автор, чем занимается, сколько проектов и публикаций, последние релизы и ссылки на профили. С этого стоит начинать.',
      inputSchema: { type: 'object', properties: {} },
      execute: wrap(() => api('/api/agent/site.json')),
    },
    {
      name: 'list_projects',
      description:
        'Список проектов автора с описанием, категорией, числом звёзд и загрузок. Категория hard — проекты, написанные вручную; agents — сделанные с LLM-агентами.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['all', 'hard', 'agents'], description: 'Какие проекты вернуть' },
          query: { type: 'string', description: 'Поиск по названию и описанию' },
          limit: { type: 'number', description: 'Сколько проектов вернуть (по умолчанию 50)' },
        },
      },
      execute: wrap((a) =>
        api('/api/agent/projects.json', { category: a.category || 'all', q: a.query, limit: a.limit }),
      ),
    },
    {
      name: 'get_project',
      description:
        'Один проект целиком: описание, текст README, последние релизы с датами и числом загрузок, открытые issues.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Имя репозитория, например «MyApp»' } },
        required: ['name'],
      },
      execute: wrap((a) => {
        if (!a.name) throw new Error('нужно имя проекта');
        return api('/api/agent/projects.json', { name: a.name });
      }),
    },
    {
      name: 'list_publications',
      description: 'Публикации автора: заголовок, дата, короткое превью и ссылка. Новые сверху.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Сколько публикаций вернуть (по умолчанию 20)' },
          offset: { type: 'number', description: 'Смещение для постраничного обхода' },
        },
      },
      execute: wrap((a) => api('/api/agent/publications.json', { limit: a.limit, offset: a.offset })),
    },
    {
      name: 'get_publication',
      description: 'Текст одной публикации целиком в markdown по её идентификатору.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Идентификатор публикации' } },
        required: ['id'],
      },
      execute: wrap((a) => {
        if (a.id === undefined || a.id === null) throw new Error('нужен id публикации');
        return api('/api/agent/publications.json', { id: a.id });
      }),
    },
    {
      name: 'search_site',
      description: 'Поиск по проектам и публикациям сразу — по названию, описанию и тексту постов.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Что искать' } },
        required: ['query'],
      },
      execute: wrap((a) => {
        if (!a.query) throw new Error('нужен поисковый запрос');
        return api('/api/agent/search.json', { q: a.query });
      }),
    },
    {
      name: 'show_projects',
      description:
        'Открыть на сайте список проектов нужной категории (all, hard или agents) — то же, что нажать вкладку на странице проектов.',
      inputSchema: {
        type: 'object',
        properties: { category: { type: 'string', enum: ['all', 'hard', 'agents'] } },
      },
      execute: async (input) => {
        const category = (argsOf(input).category || 'all').toLowerCase();
        const known = ['all', 'hard', 'agents'];
        if (!known.includes(category)) return fail(`Неизвестная категория: ${category}`);

        // Уже на странице проектов — просто переключаем вкладку, без перезагрузки
        const tab = document.querySelector(`[data-tab="${category}"]`);
        if (tab) {
          tab.click();
          return result(`Показаны проекты категории «${category}».`);
        }
        const base = lang === 'en' ? '/en/projects' : '/projects';
        location.href = category === 'all' ? base : `${base}#${category}`;
        return result(`Открываю ${base} (категория «${category}»).`);
      },
    },
  ];

  // provideContext задаёт весь набор разом; registerTool — запасной путь для
  // редакций API, где его нет.
  if (typeof ctx.provideContext === 'function') ctx.provideContext({ tools });
  else if (typeof ctx.registerTool === 'function') for (const tool of tools) ctx.registerTool(tool);
}
