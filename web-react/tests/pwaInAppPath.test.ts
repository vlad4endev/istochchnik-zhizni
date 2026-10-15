import { describe, expect, it } from 'vitest';

import {
  absoluteAppUrlForShare,
  appPathFromHref,
  isInAppDeepLinkPath,
} from '../src/features/pwa/pwaInAppPath';

describe('pwaInAppPath', () => {
  it('recognizes meeting and call deep-link paths', () => {
    expect(isInAppDeepLinkPath('/call/join/abc')).toBe(true);
    expect(isInAppDeepLinkPath('/call/11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(isInAppDeepLinkPath('/callback')).toBe(false);
    expect(isInAppDeepLinkPath('/calls')).toBe(false);
    expect(isInAppDeepLinkPath('/messenger')).toBe(false);
  });

  it('keeps /call/join in-app even when host differs from current origin', () => {
    const path = appPathFromHref(
      'https://other.example.ru/call/join/token-1',
      'https://app.example.ru/messenger',
    );
    expect(path).toBe('/call/join/token-1');
  });

  it('maps relative invite paths', () => {
    expect(appPathFromHref('/call/join/tok')).toBe('/call/join/tok');
    expect(appPathFromHref('/call/join/tok?decline=1')).toBe('/call/join/tok?decline=1');
  });

  it('rewrites share URLs to the current origin for meeting invites', () => {
    const prev = globalThis.window;
    // jsdom / vitest: ensure location.origin is defined for absoluteAppUrlForShare
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { origin: 'https://app.example.ru', href: 'https://app.example.ru/' },
      },
    });
    try {
      expect(absoluteAppUrlForShare('https://cdn.example.ru/call/join/abc')).toBe(
        'https://app.example.ru/call/join/abc',
      );
      expect(absoluteAppUrlForShare('/call/join/abc')).toBe('https://app.example.ru/call/join/abc');
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: prev });
    }
  });
});
