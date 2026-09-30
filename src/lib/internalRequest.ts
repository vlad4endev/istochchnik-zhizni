import { IncomingMessage, ServerResponse } from 'node:http';
import type { Application, Request } from 'express';

export type InternalResult = { status: number; body: unknown };

/**
 * Выполняет GET на другой маршрут того же приложения внутри процесса (без сети):
 * с теми же заголовками/cookie, поэтому авторизация, права и валидация — как у обычного запроса.
 * Ответ перехватывается и возвращается; в сокет ничего не пишется.
 */
export function internalGet(parent: Request, path: string): Promise<InternalResult> {
  const app = parent.app as Application & {
    handle: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  };
  return new Promise((resolve) => {
    const req = new IncomingMessage(parent.socket);
    req.method = 'GET';
    req.url = path;
    req.headers = { ...parent.headers };
    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      resolve({ status: res.statusCode, body });
    };
    res.write = ((chunk: unknown): boolean => {
      if (chunk != null) chunks.push(Buffer.from(chunk as string | Uint8Array));
      return true;
    }) as typeof res.write;
    res.end = ((chunk?: unknown): ServerResponse => {
      if (typeof chunk === 'string' || chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
      finish();
      return res;
    }) as typeof res.end;
    app.handle(req, res, () => {
      res.statusCode = 404;
      finish();
    });
  });
}
