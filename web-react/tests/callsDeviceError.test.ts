import { describe, expect, it } from 'vitest';

import { mapDeviceError } from '../src/features/calls/callsApi';

describe('mapDeviceError', () => {
  it('maps NotAllowedError', () => {
    const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    expect(mapDeviceError(err)).toMatch(/Нет доступа/);
  });

  it('maps NotFoundError', () => {
    const err = Object.assign(new Error('Device not found'), { name: 'NotFoundError' });
    expect(mapDeviceError(err)).toMatch(/не найдено/i);
  });

  it('maps unknown', () => {
    expect(mapDeviceError(new Error('boom'))).toMatch(/Не удалось получить доступ/);
  });
});
