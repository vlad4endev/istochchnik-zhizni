import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DRIVE_JS_ORIGIN,
  DEFAULT_DRIVE_OAUTH_REDIRECT,
  driveJsOrigin,
  driveOAuthRedirectUri,
  sanitizeDriveUri,
} from '../src/features/admin/driveOAuthUri';

describe('driveOAuthUri', () => {
  it('strips spaces and newlines so Google Console accepts the URI', () => {
    expect(sanitizeDriveUri(' https://app.church-tambov.ru/\n')).toBe(
      'https://app.church-tambov.ru/',
    );
    expect(
      driveOAuthRedirectUri('https://app.church-tambov.ru/api/backup/drive/oauth/callback\n '),
    ).toBe(DEFAULT_DRIVE_OAUTH_REDIRECT);
  });

  it('falls back to the production redirect when empty', () => {
    expect(driveOAuthRedirectUri(null)).toBe(DEFAULT_DRIVE_OAUTH_REDIRECT);
    expect(driveOAuthRedirectUri('  \n')).toBe(DEFAULT_DRIVE_OAUTH_REDIRECT);
  });

  it('derives JavaScript origin from the redirect URI', () => {
    expect(driveJsOrigin(DEFAULT_DRIVE_OAUTH_REDIRECT)).toBe(DEFAULT_DRIVE_JS_ORIGIN);
    expect(driveJsOrigin(' https://app.example.ru/api/backup/drive/oauth/callback\n')).toBe(
      'https://app.example.ru',
    );
    expect(driveJsOrigin(null)).toBe(DEFAULT_DRIVE_JS_ORIGIN);
  });
});
