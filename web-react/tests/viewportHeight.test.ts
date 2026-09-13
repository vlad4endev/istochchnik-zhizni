import { describe, expect, it } from 'vitest';

import {
  chooseViewportHeightPx,
  computeKeyboardInset,
  computeKeyboardOpen,
  KEYBOARD_INSET_MIN_PX,
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
        iosBrowserChrome: true,
      }),
    ).toBe(false);
  });

  it('treats a focused field in iOS Safari as a keyboard', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 60,
        textInputFocused: true,
        iosBrowserChrome: true,
      }),
    ).toBe(true);
  });

  it('keeps PWA/Android inset threshold without requiring focus', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: KEYBOARD_INSET_MIN_PX,
        textInputFocused: false,
        iosBrowserChrome: false,
      }),
    ).toBe(true);
  });

  it('ignores insets below the minimum', () => {
    expect(
      computeKeyboardOpen({
        keyboardInset: 24,
        textInputFocused: true,
        iosBrowserChrome: true,
      }),
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
