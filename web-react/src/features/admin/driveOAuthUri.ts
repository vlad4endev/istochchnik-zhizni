/** Google OAuth отклоняет URI с пробелами и переносами строки. */

export const DEFAULT_DRIVE_JS_ORIGIN = 'https://app.church-tambov.ru';
export const DEFAULT_DRIVE_OAUTH_REDIRECT =
  'https://app.church-tambov.ru/api/backup/drive/oauth/callback';

export function sanitizeDriveUri(raw: string | null | undefined): string {
  return (raw || '').replace(/\s+/g, '');
}

export function driveOAuthRedirectUri(redirectUri: string | null | undefined): string {
  return sanitizeDriveUri(redirectUri) || DEFAULT_DRIVE_OAUTH_REDIRECT;
}

export function driveJsOrigin(redirectUri: string | null | undefined): string {
  const cleaned = sanitizeDriveUri(redirectUri);
  try {
    if (cleaned) return new URL(cleaned).origin;
  } catch {
    /* ignore malformed URI */
  }
  return DEFAULT_DRIVE_JS_ORIGIN;
}
