import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyUploadsStaticHeaders,
  publicDownloadUrlForStoredFile,
  resolveLocalReleaseFilePath,
  toDownloadableReleaseUrl,
} from './appReleasesService';

const LIVE_PATH = '/uploads/releases/1795430438814-eff6d854-moya-cerkov-arm64.apk';
const LIVE_API_PATH = '/api/uploads/releases/1795430438814-eff6d854-moya-cerkov-arm64.apk';

test('toDownloadableReleaseUrl points release files at /api/uploads', () => {
  assert.equal(toDownloadableReleaseUrl(LIVE_PATH), LIVE_API_PATH);
  assert.equal(
    toDownloadableReleaseUrl(`https://app.church-tambov.ru${LIVE_PATH}`),
    `https://app.church-tambov.ru${LIVE_API_PATH}`,
  );
  assert.equal(toDownloadableReleaseUrl(LIVE_API_PATH), LIVE_API_PATH);
  assert.equal(toDownloadableReleaseUrl('https://cdn.example/app.apk'), 'https://cdn.example/app.apk');
  assert.equal(toDownloadableReleaseUrl('  '), '');
});

test('publicDownloadUrlForStoredFile uses the proxied uploads alias', () => {
  assert.equal(
    publicDownloadUrlForStoredFile('1795430438814-eff6d854-moya-cerkov-arm64.apk'),
    LIVE_API_PATH,
  );
});

test('resolveLocalReleaseFilePath accepts both public URL shapes', () => {
  const fromLegacy = resolveLocalReleaseFilePath(LIVE_PATH);
  const fromApi = resolveLocalReleaseFilePath(LIVE_API_PATH);
  assert.ok(fromLegacy);
  assert.equal(fromLegacy, fromApi);
  assert.ok(fromLegacy.endsWith('1795430438814-eff6d854-moya-cerkov-arm64.apk'));
  assert.equal(resolveLocalReleaseFilePath('/api/uploads/releases/../secret.apk'), null);
  assert.equal(resolveLocalReleaseFilePath('https://cdn.example/app.apk'), null);
});

test('applyUploadsStaticHeaders forces APK attachment and leaves other files cached', () => {
  const apk = new Map<string, string>();
  applyUploadsStaticHeaders(
    { setHeader: (name, value) => apk.set(name, value) },
    '/data/uploads/releases/app.apk',
  );
  assert.equal(apk.get('Content-Type'), 'application/vnd.android.package-archive');
  assert.equal(apk.get('Content-Disposition'), 'attachment; filename="app.apk"');
  assert.equal(apk.get('X-Content-Type-Options'), 'nosniff');

  const png = new Map<string, string>();
  applyUploadsStaticHeaders(
    { setHeader: (name, value) => png.set(name, value) },
    '/data/uploads/avatars/a.png',
  );
  assert.equal(png.has('Content-Disposition'), false);
  assert.match(png.get('Cache-Control') ?? '', /immutable/);
});
