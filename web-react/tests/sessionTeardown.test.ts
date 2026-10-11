import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginSessionTeardown,
  endSessionTeardown,
  isSessionTeardownActive,
  resetSessionTeardownForTests,
} from '../src/lib/sessionTeardown';

afterEach(() => {
  resetSessionTeardownForTests();
  vi.useRealTimers();
});

describe('sessionTeardown', () => {
  it('is inactive by default', () => {
    expect(isSessionTeardownActive()).toBe(false);
  });

  it('stays active after begin until held end elapses', () => {
    vi.useFakeTimers();
    beginSessionTeardown();
    expect(isSessionTeardownActive()).toBe(true);
    endSessionTeardown({ holdMs: 1000 });
    expect(isSessionTeardownActive()).toBe(true);
    vi.advanceTimersByTime(999);
    expect(isSessionTeardownActive()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isSessionTeardownActive()).toBe(false);
  });

  it('immediate end clears without waiting', () => {
    beginSessionTeardown();
    endSessionTeardown({ immediate: true });
    expect(isSessionTeardownActive()).toBe(false);
  });

  it('repeated end resets the hold window', () => {
    vi.useFakeTimers();
    beginSessionTeardown();
    endSessionTeardown({ holdMs: 1000 });
    vi.advanceTimersByTime(800);
    endSessionTeardown({ holdMs: 1000 });
    vi.advanceTimersByTime(800);
    expect(isSessionTeardownActive()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(isSessionTeardownActive()).toBe(false);
  });
});
