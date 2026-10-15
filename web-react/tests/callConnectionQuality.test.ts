import { ConnectionQuality } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import {
  connectionQualityAriaLabel,
  connectionQualityBars,
  connectionQualityStatusLabel,
  connectionQualityTone,
} from '../src/features/calls/callConnectionQuality';

describe('callConnectionQuality', () => {
  it('maps LiveKit quality to bar levels', () => {
    expect(connectionQualityBars(ConnectionQuality.Excellent)).toBe(4);
    expect(connectionQualityBars(ConnectionQuality.Good)).toBe(3);
    expect(connectionQualityBars(ConnectionQuality.Poor)).toBe(1);
    expect(connectionQualityBars(ConnectionQuality.Lost)).toBe(0);
    expect(connectionQualityBars(ConnectionQuality.Unknown)).toBe(2);
  });

  it('overrides status only for weak/lost', () => {
    expect(connectionQualityStatusLabel(ConnectionQuality.Excellent)).toBeNull();
    expect(connectionQualityStatusLabel(ConnectionQuality.Good)).toBeNull();
    expect(connectionQualityStatusLabel(ConnectionQuality.Poor)).toBe('Слабая связь');
    expect(connectionQualityStatusLabel(ConnectionQuality.Lost)).toBe('Нет связи');
  });

  it('exposes tone + aria for UI', () => {
    expect(connectionQualityTone(ConnectionQuality.Poor)).toBe('weak');
    expect(connectionQualityTone(ConnectionQuality.Lost)).toBe('bad');
    expect(connectionQualityAriaLabel(ConnectionQuality.Good)).toMatch(/хорошее/i);
  });
});
