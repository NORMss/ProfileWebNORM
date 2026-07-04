import { timingSafeEqual } from 'node:crypto';
import { config } from './config';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Сравниваем с самим собой, чтобы время не зависело от места расхождения.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** null — авторизован; иначе Response 401/503 для отдачи клиенту. */
export function checkBasicAuth(request: Request): Response | null {
  if (!config.adminPass) {
    return new Response('Админка не настроена: задайте ADMIN_USER и ADMIN_PASS в .env', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    if (sep > -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      const userOk = safeEqual(user, config.adminUser);
      const passOk = safeEqual(pass, config.adminPass);
      if (userOk && passOk) return null;
    }
  }
  return new Response('Требуется авторизация', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
