import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleasePushMessage } from './appReleaseNotifyService';
import type { AppReleasePublic } from './appReleasesService';

function release(overrides: Partial<AppReleasePublic> = {}): AppReleasePublic {
  return {
    id: 3,
    version_name: '1.28.0',
    version_code: 28,
    title: 'Полноценное приложение Android',
    notes: '',
    download_url: '/api/uploads/releases/app.apk',
    file_name: 'app.apk',
    file_size_bytes: 45179153,
    created_at: '2026-11-26T00:00:00.000Z',
    ...overrides,
  };
}

test('buildReleasePushMessage: версия в заголовке, заметки — первой строкой', () => {
  const msg = buildReleasePushMessage(
    release({ notes: 'Ускорение чатов\nМелкие исправления' }),
  );
  assert.equal(msg.title, 'Обновление приложения 1.28.0');
  assert.equal(msg.body, 'Ускорение чатов');
});

test('buildReleasePushMessage: без заметок — подсказка про обновление', () => {
  const msg = buildReleasePushMessage(release());
  assert.equal(msg.title, 'Обновление приложения 1.28.0');
  assert.match(msg.body, /обновить/i);
});

test('buildReleasePushMessage: без имени версии — код сборки в заголовке', () => {
  const msg = buildReleasePushMessage(release({ version_name: '', version_code: 31 }));
  assert.equal(msg.title, 'Обновление приложения сборка 31');
});

test('buildReleasePushMessage: длинные заметки обрезаются под лимит FCM', () => {
  const msg = buildReleasePushMessage(release({ notes: 'Очень длинная строка. '.repeat(30) }));
  assert.ok(msg.body.length <= 178);
});
