/**
 * Человекочитаемые ошибки Google Drive API для админки бекапов.
 */

type DriveErrorPayload = {
  message?: string;
  status?: string;
  errors?: Array<{ reason?: string; message?: string }>;
};

function readDriveErrorPayload(error: unknown): {
  message: string;
  reason: string;
  status: number | string | undefined;
} {
  const anyErr = error as {
    message?: string;
    code?: number | string;
    response?: { status?: number; data?: unknown };
  };
  const data = anyErr?.response?.data as { error?: DriveErrorPayload } | string | undefined;
  const payload = typeof data === 'object' && data ? data.error : undefined;
  const reason = payload?.errors?.[0]?.reason || '';
  const apiMsg =
    payload?.message ||
    (typeof data === 'string' ? data : '') ||
    anyErr?.message ||
    (error instanceof Error ? error.message : String(error));
  return {
    message: String(apiMsg),
    reason,
    status: anyErr?.response?.status ?? anyErr?.code,
  };
}

export function formatDriveApiError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Google Drive:')) {
    return error.message;
  }
  const { message, reason, status } = readDriveErrorPayload(error);
  const text = message.replace(/\s+/g, ' ');

  if (reason === 'storageQuotaExceeded' || /storageQuotaExceeded|quota has been exceeded/i.test(text)) {
    return (
      'Google Drive: у service account нет своей квоты, файл не попал в расшаренную папку. ' +
      'Для личного Gmail нажмите «Войти через Google». ' +
      'В Google Workspace — общий диск, SA как «Управляющий содержимым».'
    );
  }
  if (
    /specified parent/i.test(text) ||
    reason === 'insufficientFilePermissions' ||
    /insufficientFilePermissions|insufficient permissions|The user does not have sufficient permissions/i.test(
      text,
    )
  ) {
    return (
      'Google Drive: нет права создать файл в этой папке (Insufficient permissions for the specified parent). ' +
      'Шаринг обычной папки личного Gmail на service account больше не даёт запись. ' +
      'Подключите свой Google-аккаунт кнопкой «Войти через Google» — файлы пойдут в вашу папку. ' +
      'Либо в Workspace создайте общий диск и добавьте SA как «Управляющий содержимым».'
    );
  }
  if (status === 404 || /not found/i.test(text)) {
    return 'Google Drive: папка или файл не найдены. Проверьте ID/ссылку папки.';
  }
  if (status === 401 || /invalid_grant|unauthorized|invalid_client/i.test(text)) {
    return 'Google Drive: ключ service account отклонён. Вставьте свежий JSON-ключ и сохраните.';
  }
  if (
    status === 403 &&
    /Drive API has not been used|accessNotConfigured|API has not been enabled|it is disabled/i.test(text)
  ) {
    return 'Google Drive: в Google Cloud не включён Drive API для проекта этого service account.';
  }
  if (/maxBodyLength|maxContentLength/i.test(text)) {
    return 'Google Drive: архив не ушёл из‑за лимита размера запроса. Повторите выгрузку.';
  }
  return `Google Drive: ${text.slice(0, 400)}`;
}
