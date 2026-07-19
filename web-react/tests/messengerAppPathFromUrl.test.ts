import { afterEach, describe, expect, it, vi } from 'vitest';

import { appPathFromAbsoluteUrl } from '../src/features/messenger/messengerPlainText';

describe('appPathFromAbsoluteUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns in-app path for same-origin service plan share links', () => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://app.church-tambov.ru/messenger?conversationId=abc',
        origin: 'https://app.church-tambov.ru',
      },
    });

    expect(
      appPathFromAbsoluteUrl('https://app.church-tambov.ru/service-plan/share/token123'),
    ).toBe('/service-plan/share/token123');
  });

  it('keeps query and hash', () => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://app.example.com/messenger',
        origin: 'https://app.example.com',
      },
    });

    expect(appPathFromAbsoluteUrl('https://app.example.com/service-plan/edit/t?x=1#top')).toBe(
      '/service-plan/edit/t?x=1#top',
    );
  });

  it('returns null for external origins', () => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://app.church-tambov.ru/messenger',
        origin: 'https://app.church-tambov.ru',
      },
    });

    expect(appPathFromAbsoluteUrl('https://example.com/service-plan/share/x')).toBeNull();
  });
});
