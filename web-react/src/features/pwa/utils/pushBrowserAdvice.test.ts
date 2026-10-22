import { describe, expect, it } from 'vitest';
import {
  adviceForPushPermissionDenied,
  adviceForPushServiceUnreachable,
  adviceForPushUnsupported,
  detectPushPlatform,
} from './pushBrowserAdvice';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  yandex:
    'Mozilla/5.0 (Linux; arm_64; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 13; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  telegramAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  edgeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
};

describe('detectPushPlatform', () => {
  it('различает браузеры и ОС', () => {
    expect(detectPushPlatform({ userAgent: UA.chromeAndroid })).toMatchObject({ browser: 'chrome', os: 'android' });
    expect(detectPushPlatform({ userAgent: UA.samsung }).browser).toBe('samsung');
    expect(detectPushPlatform({ userAgent: UA.yandex }).browser).toBe('yandex');
    expect(detectPushPlatform({ userAgent: UA.firefoxAndroid }).browser).toBe('firefox');
    expect(detectPushPlatform({ userAgent: UA.safariIos })).toMatchObject({ browser: 'safari', os: 'ios' });
    expect(detectPushPlatform({ userAgent: UA.chromeIos })).toMatchObject({ browser: 'chrome', os: 'ios' });
    expect(detectPushPlatform({ userAgent: UA.edgeDesktop })).toMatchObject({ browser: 'edge', os: 'desktop' });
  });

  it('Brave распознаётся по navigator.brave, а не по UA', () => {
    expect(detectPushPlatform({ userAgent: UA.chromeAndroid, hasBraveApi: true }).browser).toBe('brave');
  });

  it('встроенный браузер мессенджера', () => {
    expect(detectPushPlatform({ userAgent: UA.telegramAndroid }).browser).toBe('inapp');
  });

  it('iPad с UA как у Mac считается iOS', () => {
    const p = detectPushPlatform({ userAgent: UA.safariIos.replace('iPhone', 'Macintosh'), platform: 'MacIntel', maxTouchPoints: 5 });
    expect(p.os).toBe('ios');
  });
});

describe('подсказки', () => {
  it('Brave получает инструкцию про сервисы Google', () => {
    const p = detectPushPlatform({ userAgent: UA.chromeAndroid, hasBraveApi: true });
    expect(adviceForPushServiceUnreachable(p)).toContain('сервисы Google для push-сообщений');
  });

  it('Firefox не отправляют чинить Google', () => {
    const p = detectPushPlatform({ userAgent: UA.firefoxAndroid });
    expect(adviceForPushServiceUnreachable(p)).not.toContain('Google');
  });

  it('Chromium без Brave: упоминание Google и совет про Firefox', () => {
    const p = detectPushPlatform({ userAgent: UA.chromeAndroid });
    expect(adviceForPushServiceUnreachable(p)).toContain('Firefox');
  });

  it('iOS не в Safari и не установлено — просят открыть в Safari', () => {
    const p = detectPushPlatform({ userAgent: UA.chromeIos });
    expect(adviceForPushUnsupported(p)).toContain('Safari');
  });

  it('встроенный браузер — просят открыть в системном', () => {
    const p = detectPushPlatform({ userAgent: UA.telegramAndroid });
    expect(adviceForPushUnsupported(p)).toContain('системном браузере');
  });

  it('отказ на установленной Android-PWA ведёт в настройки Android', () => {
    const p = detectPushPlatform({ userAgent: UA.chromeAndroid, installed: true });
    expect(adviceForPushPermissionDenied(p)).toContain('Настройки Android');
  });
});
