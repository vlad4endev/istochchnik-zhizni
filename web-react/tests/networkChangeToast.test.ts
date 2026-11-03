import { describe, expect, it } from 'vitest';

import { networkSwitchToastText } from '../src/features/calls/useNetworkChangeToast';

describe('networkSwitchToastText', () => {
  it('при понижении типа сети предупреждает о перебоях', () => {
    const text = networkSwitchToastText('4g', '3g');
    expect(text).toContain('4G → 3G');
    expect(text).toContain('перебои');
  });

  it('при повышении типа сети — без предупреждения', () => {
    const text = networkSwitchToastText('3g', '4g');
    expect(text).toContain('3G → 4G');
    expect(text).not.toContain('перебои');
  });

  it('slow-2g отображается как 2G', () => {
    expect(networkSwitchToastText('4g', 'slow-2g')).toContain('4G → 2G');
  });

  it('одинаковый тип — без тоста', () => {
    expect(networkSwitchToastText('4g', '4g')).toBeNull();
  });

  it('нет базовой линии (первое чтение) — без тоста', () => {
    expect(networkSwitchToastText(null, '4g')).toBeNull();
  });

  it('неизвестный следующий тип — без тоста', () => {
    expect(networkSwitchToastText('4g', null)).toBeNull();
  });
});
