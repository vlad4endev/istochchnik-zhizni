import { describe, expect, it } from 'vitest';

import {
  isDeployVersionMismatch,
  normalizeBuildVersion,
} from '../src/lib/clientBuildVersion';

describe('clientBuildVersion', () => {
  it('нормализует BOM и пробелы', () => {
    expect(normalizeBuildVersion('\uFEFFa09e4379\n')).toBe('a09e4379');
  });

  it('считает mismatch только при разных непустых версиях', () => {
    expect(isDeployVersionMismatch('abc', 'abc\n')).toBe(false);
    expect(isDeployVersionMismatch('abc', 'def')).toBe(true);
    expect(isDeployVersionMismatch('abc', '')).toBe(false);
    expect(isDeployVersionMismatch('', 'def')).toBe(false);
  });
});
