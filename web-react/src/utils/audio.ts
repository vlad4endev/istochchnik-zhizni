export type AudioType = 'send' | 'receive';

/** Короткий звук через Web Audio API — не зависит от файлов в /public (на проде не было /sounds/*.mp3). */
export function playAudio(type: AudioType) {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = type === 'send' ? 880 : 660;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.07);
    window.setTimeout(() => {
      void ctx.close();
    }, 120);
  } catch (e) {
    console.warn('[audio] play failed:', e);
  }
}
