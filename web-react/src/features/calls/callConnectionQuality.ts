import { ConnectionQuality } from 'livekit-client';

/** Высота «делений» сигнала, как в Telegram (0–4). */
export function connectionQualityBars(quality: ConnectionQuality): 0 | 1 | 2 | 3 | 4 {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 4;
    case ConnectionQuality.Good:
      return 3;
    case ConnectionQuality.Poor:
      return 1;
    case ConnectionQuality.Lost:
      return 0;
    default:
      return 2;
  }
}

export type ConnectionQualityTone = 'good' | 'ok' | 'weak' | 'bad' | 'unknown';

export function connectionQualityTone(quality: ConnectionQuality): ConnectionQualityTone {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'good';
    case ConnectionQuality.Good:
      return 'ok';
    case ConnectionQuality.Poor:
      return 'weak';
    case ConnectionQuality.Lost:
      return 'bad';
    default:
      return 'unknown';
  }
}

/** Подпись вместо таймера при плохой связи (Telegram-style). */
export function connectionQualityStatusLabel(quality: ConnectionQuality): string | null {
  switch (quality) {
    case ConnectionQuality.Poor:
      return 'Слабая связь';
    case ConnectionQuality.Lost:
      return 'Нет связи';
    default:
      return null;
  }
}

export function connectionQualityAriaLabel(quality: ConnectionQuality): string {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'Качество связи: отличное';
    case ConnectionQuality.Good:
      return 'Качество связи: хорошее';
    case ConnectionQuality.Poor:
      return 'Качество связи: слабое';
    case ConnectionQuality.Lost:
      return 'Качество связи: нет соединения';
    default:
      return 'Качество связи: определяется…';
  }
}
