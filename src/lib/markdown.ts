import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'details', 'summary', 'del', 'ins', 'sup', 'sub'],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    a: ['href', 'title', 'target', 'rel'],
    '*': ['align'],
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy' },
    }),
  },
};

/** Рендер markdown → безопасный HTML (вызывается при синке/сохранении, не на каждый запрос). */
export function renderMarkdown(source: string): string {
  return sanitizeHtml(md.render(source), SANITIZE_OPTIONS);
}

/**
 * Рендер README репозитория: относительные ссылки на картинки и файлы
 * переписываются на raw.githubusercontent.com / github.com.
 */
export function renderReadme(source: string, fullName: string): string {
  const rawBase = `https://raw.githubusercontent.com/${fullName}/HEAD/`;
  const blobBase = `https://github.com/${fullName}/blob/HEAD/`;
  const isRelative = (url: string) =>
    !!url && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url);
  const options: sanitizeHtml.IOptions = {
    ...SANITIZE_OPTIONS,
    transformTags: {
      ...SANITIZE_OPTIONS.transformTags,
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          href: isRelative(attribs.href) ? blobBase + attribs.href : attribs.href,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          src: isRelative(attribs.src) ? rawBase + attribs.src : attribs.src,
          loading: 'lazy',
        },
      }),
    },
  };
  return sanitizeHtml(md.render(source), options);
}

/** Короткий текст-превью из markdown (для карточек публикаций). */
export function excerpt(sourceMd: string, maxLen = 200): string {
  const plain = sanitizeHtml(md.render(sourceMd), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen).trimEnd() + '…' : plain;
}
