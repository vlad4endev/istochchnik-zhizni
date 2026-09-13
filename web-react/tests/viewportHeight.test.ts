import { describe, expect, it } from 'vitest';

import {
  chooseViewportHeightPx,
  computeKeyboardInset,
  computeKeyboardOpen,
  IOS_BROWSER_CHROME_MAX_PX,
  IOS_IDLE_VIEWPORT_CSS,
  iosNeedsLvhIdleShell,
  KEYBOARD_INSET_MIN_PX,
  layoutBottomInsetPx,
  parseIosVersion,
  shouldUseCssViewportOnIosIdle,
  VIEWPORT_HEIGHT_FLOOR_PX,
} from '../src/lib/viewportHeight';
import { lockedViewportContent, VIEWPORT_ANDROID, VIEWPORT_BASE } from '../src/lib/nativeShellViewport';

describe('computeKeyboardInset', () => {
  it('measures Safari chrome as layout minus visual', () => {
    expect(computeKeyboardInset(844, 720, 0)).toBe(124);
  });

  it('uses stale visual vs shrunk layout on iOS PWA keyboard frames', () => {
    expect(computeKeyboardInset(500, 844, 0)).toBe(344);
  });
});

describe('computeKeyboardOpen', () => {
  it('does not treat iOS Safari chrome as a keyboard without a focused field', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 124,
        textInputFocused: false,
        iosWebKit: true,
      }),
    ).toBe(false);
  });

  it('does not treat iOS PWA safe-area gap as a keyboard', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 59,
        textInputFocused: false,
        iosWebKit: true,
      }),
    ).toBe(false);
  });

  it('does not shrink iOS PWA when visualViewport is half-screen without focus', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 344,
        textInputFocused: false,
        iosWebKit: true,
      }),
    ).toBe(false);
  });

  it('treats a focused field on iOS as a keyboard', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 60,
        textInputFocused: true,
        iosWebKit: true,
      }),
    ).toBe(true);
  });

  it('keeps Android inset threshold without requiring focus', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: KEYBOARD_INSET_MIN_PX,
        textInputFocused: false,
        iosWebKit: false,
      }),
    ).toBe(true);
  });

  it('ignores insets below the minimum', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 24,
        textInputFocused: true,
        iosWebKit: true,
      }),
    ).toBe(false);
  });
});

describe('parseIosVersion / iosNeedsLvhIdleShell', () => {
  it('parses iPhone OS 17_5 and treats 17.5+ as the broken Safari viewport range', () => {
    expect(parseIosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toEqual({
      major: 17,
      minor: 5,
    });
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe(true);
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)')).toBe(true);
  });

  it('leaves iOS 17.4 and older on the pixel shell that still worked', () => {
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)')).toBe(false);
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X)')).toBe(false);
  });

  it('parses iPad CPU OS tokens', () => {
    expect(parseIosVersion('Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X)')).toEqual({
      major: 17,
      minor: 5,
    });
    expect(iosNeedsLvhIdleShell('Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X)')).toBe(true);
  });
});

describe('layoutBottomInsetPx', () => {
  it('keeps Safari chrome inset on iOS 17.5+ so the tab bar sits above the browser UI', () => {
    expect(
      layoutBottomInsetPx({
        keyboardInset: 124,
        keyboardOpen: false,
        iosWebKit: true,
        iosLvhShell: true,
      }),
    ).toBe(124);
  });

  it('does not pin the tab bar to a half-screen visualViewport on iOS 17.5+ idle', () => {
    expect(
      layoutBottomInsetPx({
        keyboardInset: 344,
        keyboardOpen: false,
        iosWebKit: true,
        iosLvhShell: true,
      }),
    ).toBe(0);
    expect(344).toBeGreaterThan(IOS_BROWSER_CHROME_MAX_PX);
  });

  it('does not lift the tab bar on iOS 17.4 and older (shell is already visual height)', () => {
    expect(
      layoutBottomInsetPx({
        keyboardInset: 124,
        keyboardOpen: false,
        iosWebKit: true,
        iosLvhShell: false,
      }),
    ).toBe(0);
  });

  it('keeps a real keyboard inset on iOS when a field is focused', () => {
    expect(
      layoutBottomInsetPx({
        keyboardInset: 336,
        keyboardOpen: true,
        iosWebKit: true,
        iosLvhShell: true,
      }),
    ).toBe(336);
  });
});

describe('shouldUseCssViewportOnIosIdle', () => {
  it('uses 100lvh on iOS 17.5+ when the keyboard is closed', () => {
    expect(
      shouldUseCssViewportOnIosIdle({ iosWebKit: true, keyboardOpen: false, iosLvhShell: true }),
    ).toBe(true);
    expect(IOS_IDLE_VIEWPORT_CSS).toBe('100lvh');
  });

  it('locks pixels when the keyboard is open, on Android, or on iOS before 17.5', () => {
    expect(
      shouldUseCssViewportOnIosIdle({ iosWebKit: true, keyboardOpen: true, iosLvhShell: true }),
    ).toBe(false);
    expect(
      shouldUseCssViewportOnIosIdle({ iosWebKit: false, keyboardOpen: false, iosLvhShell: false }),
    ).toBe(false);
    expect(
      shouldUseCssViewportOnIosIdle({ iosWebKit: true, keyboardOpen: false, iosLvhShell: false }),
    ).toBe(false);
  });
});

describe('chooseViewportHeightPx', () => {
  it('recovers a short visualViewport in iOS Safari using 100dvh', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 420,
        layoutHeight: 844,
        dvhPx: 650,
        clientDocH: 420,
        keyboardOpen: false,
        iosBrowserChrome: true,
      }),
    ).toBe(650);
  });

  it('does not pick the large layout viewport in iOS Safari (area behind chrome)', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 650,
        layoutHeight: 844,
        dvhPx: 650,
        clientDocH: 650,
        keyboardOpen: false,
        iosBrowserChrome: true,
      }),
    ).toBe(650);
  });

  it('does not ratchet down via clientHeight while the keyboard is open', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 520,
        layoutHeight: 520,
        dvhPx: 844,
        clientDocH: 300,
        keyboardOpen: true,
        iosBrowserChrome: false,
      }),
    ).toBe(520);
  });

  it('fills the PWA screen with the max metric when the keyboard is closed', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 797,
        layoutHeight: 844,
        dvhPx: 844,
        clientDocH: 844,
        keyboardOpen: false,
        iosBrowserChrome: false,
      }),
    ).toBe(844);
  });

  it('recovers iOS PWA from a half-height visualViewport when the keyboard is not open', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 420,
        layoutHeight: 844,
        dvhPx: 844,
        clientDocH: 420,
        keyboardOpen: false,
        iosBrowserChrome: false,
      }),
    ).toBe(844);
  });

  it('never returns below the floor when a metric exists', () => {
    expect(
      chooseViewportHeightPx({
        visualHeight: 40,
        layoutHeight: 0,
        dvhPx: 0,
        clientDocH: 0,
        keyboardOpen: false,
        iosBrowserChrome: true,
      }),
    ).toBe(VIEWPORT_HEIGHT_FLOOR_PX);
  });
});

describe('lockedViewportContent', () => {
  it('omits interactive-widget on iPhone Safari', () => {
    expect(lockedViewportContent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      VIEWPORT_BASE,
    );
    expect(lockedViewportContent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).not.toMatch(
      /interactive-widget/,
    );
  });

  it('keeps interactive-widget on Android Chrome', () => {
    expect(
      lockedViewportContent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0'),
    ).toBe(VIEWPORT_ANDROID);
  });
});
