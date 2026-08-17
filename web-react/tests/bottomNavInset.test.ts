import { afterEach, describe, expect, it } from 'vitest';

import { measuredBottomNavHeightPx } from '../src/lib/bottomNavInset';

const originalGetComputedStyle = globalThis.getComputedStyle;

function fakeNav(height: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      height,
      width: 390,
      top: 0,
      left: 0,
      bottom: height,
      right: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as HTMLElement;
}

function stubComputedStyle(style: { display: string; visibility: string; opacity: string }) {
  globalThis.getComputedStyle = () => style as CSSStyleDeclaration;
}

describe('measuredBottomNavHeightPx', () => {
  afterEach(() => {
    globalThis.getComputedStyle = originalGetComputedStyle;
  });

  it('returns rounded height for a visible tab bar', () => {
    stubComputedStyle({ display: 'flex', visibility: 'visible', opacity: '1' });
    expect(measuredBottomNavHeightPx(fakeNav(83.4))).toBe(83);
  });

  it('ignores a hidden chat-mode tab bar so the last measurement stays', () => {
    stubComputedStyle({ display: 'none', visibility: 'visible', opacity: '1' });
    expect(measuredBottomNavHeightPx(fakeNav(80))).toBeNull();
  });

  it('ignores opacity-0 chrome lock (reading mode / keyboard)', () => {
    stubComputedStyle({ display: 'flex', visibility: 'visible', opacity: '0' });
    expect(measuredBottomNavHeightPx(fakeNav(80))).toBeNull();
  });

  it('returns null when the node is missing', () => {
    expect(measuredBottomNavHeightPx(null)).toBeNull();
  });
});
