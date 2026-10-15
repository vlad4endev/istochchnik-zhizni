import { describe, expect, it } from 'vitest';

import { installLegacyBrowserPolyfills } from '../src/lib/legacyBrowserPolyfills';

describe('legacyBrowserPolyfills', () => {
  it('Object.hasOwn works after install (idempotent on modern runtimes)', () => {
    installLegacyBrowserPolyfills();
    expect(typeof Object.hasOwn).toBe('function');
    expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true);
    expect(Object.hasOwn({ a: 1 }, 'b')).toBe(false);
    expect(Object.hasOwn(Object.create(null), 'x')).toBe(false);
  });

  it('Array.prototype.at works after install', () => {
    installLegacyBrowserPolyfills();
    expect([10, 20, 30].at(-1)).toBe(30);
    expect([10, 20, 30].at(0)).toBe(10);
    expect([10, 20, 30].at(99)).toBeUndefined();
  });

  it('String.prototype.replaceAll works after install', () => {
    installLegacyBrowserPolyfills();
    expect('a-a-a'.replaceAll('-', '_')).toBe('a_a_a');
  });
});
