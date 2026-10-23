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
      'Проверьте ID папки и право «Редактор» на email из ключа. ' +
      'В Google Workspace надёжнее общий диск (Shared Drive), куда SA добавлен как участник.'
    );
  }
  if (
    reason === 'insufficientFilePermissions' ||
    /insufficientFilePermissions|insufficient permissions|The user does not have sufficient permissions/i.test(
      text,
    )
  ) {
    return 'Google Drive: нет права записи в папку. Расшарьте папку на email service account как «Редактор», не «Читатель».';
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
