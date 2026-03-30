import axios from 'axios';

export function humanizeServerError(raw: string): string {
  if (raw === 'Database error') {
    return 'Ошибка базы данных на сервере. Проверьте DATABASE_URL на хосте API '
      + '(пароль, порт, SSL) и что миграции применены к этой базе.';
  }
  return raw;
}

function readErrorField(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim().length > 0) {
      return humanizeServerError(err.trim());
    }
  }
  return null;
}

export function mapAxiosAuthError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const server = readErrorField(e.response?.data);
    if (server) return server;
    if (e.code === 'ERR_NETWORK' || e.message.toLowerCase().includes('network')) {
      return 'Нет связи с сервером. Проверьте VITE_API_BASE_URL и что API доступен (HTTPS ↔ HTTP).';
    }
    if (e.response?.status === 401 || e.response?.status === 403) {
      return 'Неверный телефон или пароль.';
    }
    return e.message || 'Ошибка сети';
  }
  return 'Не удалось выполнить запрос.';
}
