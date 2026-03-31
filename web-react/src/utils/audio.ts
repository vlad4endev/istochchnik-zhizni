export type AudioType = 'send' | 'receive';

const AUDIO_FILES: Record<AudioType, string> = {
  send: '/sounds/send.mp3',
  receive: '/sounds/receive.mp3',
};

export function playAudio(type: AudioType) {
  try {
    const audio = new Audio(AUDIO_FILES[type]);
    const res = audio.play();
    if (res && typeof (res as Promise<void>).catch === 'function') {
      (res as Promise<void>).catch((e) => {
        console.warn('[audio] autoplay blocked or failed:', e);
      });
    }
  } catch (e) {
    console.warn('[audio] autoplay blocked or failed:', e);
  }
}
