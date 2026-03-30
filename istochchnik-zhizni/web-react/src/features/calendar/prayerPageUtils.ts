import axios from 'axios';

export function loadErrorDescription(err: unknown): string | null {
  if (err == null) return null;
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const m = (data as { error?: unknown }).error;
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
    const code = err.response?.status;
    const ct = String(err.response?.headers?.['content-type'] ?? '');
    if (code === 404) {
      return 'Сервер вернул 404. Убедитесь, что адрес API — хост бэкенда с маршрутом /api/calendar, а не только статика.';
    }
    if (ct.includes('text/html')) {
      return 'Пришёл ответ HTML вместо JSON. Часто URL API совпадает с фронтендом — укажите отдельный адрес бэкенда.';
    }
    if (err.code === 'ERR_NETWORK' || err.message.toLowerCase().includes('network')) {
      return 'Не удаётся подключиться к серверу. Проверьте CORS, HTTPS и доступность API.';
    }
    const msg = err.message;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}
