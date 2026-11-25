import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AndroidAppReleaseWidgetView,
  isAppleMobileDevice,
  releaseDownloadFileName,
  releaseLinkOpensNewTab,
  resolveReleaseDownloadHref,
} from '../src/features/dashboard/components/AndroidAppReleaseWidget';
import type { AppReleaseLatest } from '../src/features/admin/api';

const LIVE = '/uploads/releases/1795430438814-eff6d854-moya-cerkov-arm64.apk';
const LIVE_API = '/api/uploads/releases/1795430438814-eff6d854-moya-cerkov-arm64.apk';

const release: AppReleaseLatest = {
  id: 3,
  version_name: '1.27.1',
  version_code: 27,
  title: 'Установить полноценное приложение на Андроид',
  notes: '',
  download_url: LIVE,
  file_name: 'moya-cerkov-arm64.apk',
  file_size_bytes: 45179153,
  created_at: '2026-11-23T10:40:39.042Z',
};

describe('resolveReleaseDownloadHref', () => {
  it('rewrites the hanging /uploads/releases path to /api/uploads', () => {
    expect(resolveReleaseDownloadHref(LIVE, '')).toBe(LIVE_API);
    expect(resolveReleaseDownloadHref(`https://app.church-tambov.ru${LIVE}`, '')).toBe(
      `https://app.church-tambov.ru${LIVE_API}`,
    );
    expect(resolveReleaseDownloadHref(LIVE_API, '')).toBe(LIVE_API);
  });

  it('prefixes the API origin for the packaged app', () => {
    expect(resolveReleaseDownloadHref(LIVE, 'https://app.church-tambov.ru')).toBe(
      `https://app.church-tambov.ru${LIVE_API}`,
    );
  });

  it('leaves an external apk url alone', () => {
    expect(resolveReleaseDownloadHref('https://cdn.example/builds/app.apk', '')).toBe(
      'https://cdn.example/builds/app.apk',
    );
  });
});

describe('download attribute', () => {
  it('names a same-origin file and does not force a new tab', () => {
    const href = resolveReleaseDownloadHref(LIVE, '');
    expect(releaseDownloadFileName(href, release.file_name, 'https://app.church-tambov.ru')).toBe(
      'moya-cerkov-arm64.apk',
    );
    expect(releaseLinkOpensNewTab(href, 'https://app.church-tambov.ru')).toBe(false);
  });

  it('does not set download on a cross-origin url', () => {
    const href = 'https://cdn.example/builds/app.apk';
    expect(releaseDownloadFileName(href, 'app.apk', 'https://app.church-tambov.ru')).toBeUndefined();
    expect(releaseLinkOpensNewTab(href, 'https://app.church-tambov.ru')).toBe(true);
  });
});

describe('isAppleMobileDevice', () => {
  it('detects iPhone, iPad and iPod user agents', () => {
    expect(
      isAppleMobileDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    expect(
      isAppleMobileDevice(
        'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    expect(
      isAppleMobileDevice(
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(true);
  });

  it('does not flag Android or desktop devices', () => {
    expect(
      isAppleMobileDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
    expect(
      isAppleMobileDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
    expect(isAppleMobileDevice('')).toBe(false);
  });

  it('does not throw in a node environment without a real navigator', () => {
    expect(typeof isAppleMobileDevice()).toBe('boolean');
  });
});

describe('AndroidAppReleaseWidgetView', () => {
  it('renders a real download link instead of a scripted button', () => {
    const href = resolveReleaseDownloadHref(release.download_url, '');
    const html = renderToStaticMarkup(
      <AndroidAppReleaseWidgetView
        release={release}
        isUpdate={false}
        href={href}
        downloadName={releaseDownloadFileName(href, release.file_name, 'https://app.church-tambov.ru')}
        openInNewTab={false}
        onActivate={() => {}}
      />,
    );
    expect(html).toContain(`href="${LIVE_API}"`);
    expect(html).toContain('download="moya-cerkov-arm64.apk"');
    expect(html).not.toContain('target=');
    expect(html).toContain('Скачать APK');
    expect(html).toContain('Версия 1.27.1');
    expect(html).toContain('43.1 МБ');
  });
});

describe('widget source', () => {
  it('does not synthesize a detached anchor click', () => {
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/dashboard/components/AndroidAppReleaseWidget.tsx'),
      'utf8',
    );
    expect(src).not.toContain("document.createElement('a')");
    expect(src).not.toContain('window.open(');
  });
});
