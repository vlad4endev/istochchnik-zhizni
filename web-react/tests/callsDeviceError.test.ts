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

  it('maps connection failures to a non-technical message', () => {
    expect(mapDeviceError(new Error('websocket connection failed'))).toMatch(
      /технические работы|Ошибка сервера/i,
    );
    expect(mapDeviceError(new Error('websocket connection failed'))).not.toMatch(/7881|WSS|\/lk/i);
  });

  it('maps unknown message as-is', () => {
    expect(mapDeviceError(new Error('boom'))).toBe('boom');
  });
});
