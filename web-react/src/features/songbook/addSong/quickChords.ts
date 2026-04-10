import { Key } from '@tonaljs/tonal';

/** Диатонические триады для быстрой панели (мажор / натуральный минор). */
export function quickChordsForKey(tonic: string, mode: 'major' | 'minor'): string[] {
  const t = tonic.trim();
  if (!t) return [];
  try {
    if (mode === 'major') {
      return Key.majorKey(t).triads.filter((c) => !c.includes('dim'));
    }
    return Key.minorKey(t).natural.triads.filter((c) => !c.toLowerCase().includes('dim'));
  } catch {
    return [];
  }
}
