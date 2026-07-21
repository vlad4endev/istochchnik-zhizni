import { describe, expect, it } from 'vitest';

import { canAccessMySermons } from '../src/features/mySermons/mySermonsAccess';

describe('canAccessMySermons', () => {
  it('allows pastor and admin', () => {
    expect(canAccessMySermons('pastor', null)).toBe(true);
    expect(canAccessMySermons('admin', null)).toBe(true);
    expect(canAccessMySermons('member', null, ['admin'])).toBe(true);
  });

  it('denies minister without preacher ministry role', () => {
    expect(canAccessMySermons('minister', null)).toBe(false);
    expect(canAccessMySermons('minister', 'Ведущий')).toBe(false);
  });

  it('allows preacher ministry role for any app role', () => {
    expect(canAccessMySermons('member', 'Проповедник')).toBe(true);
    expect(canAccessMySermons('member', 'Ведущий; Проповедник')).toBe(true);
    expect(canAccessMySermons('minister', 'проповедник')).toBe(true);
  });

  it('denies regular members', () => {
    expect(canAccessMySermons('member', null)).toBe(false);
    expect(canAccessMySermons('member', 'Музыкант')).toBe(false);
  });
});
