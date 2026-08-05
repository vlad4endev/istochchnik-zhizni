import { describe, expect, it } from 'vitest';

import {
  audioDisplayTitle,
  isChatAudioFile,
  isMessengerAudioFilePayload,
  isVoiceRecordingFileName,
  messengerAudioListPreview,
} from '../src/features/messenger/chatAudio';

describe('chatAudio helpers', () => {
  it('detects audio by mime and extension', () => {
    expect(isChatAudioFile({ type: 'audio/mpeg', name: 'track.bin' })).toBe(true);
    expect(isChatAudioFile({ type: '', name: 'sermon.mp3' })).toBe(true);
    expect(isChatAudioFile({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false);
  });

  it('recognizes voice recording filenames', () => {
    expect(isVoiceRecordingFileName('voice-1710000000.webm')).toBe(true);
    expect(isVoiceRecordingFileName('Worship.mp3')).toBe(false);
  });

  it('classifies file payloads vs voice', () => {
    expect(isMessengerAudioFilePayload({ kind: 'file', name: 'a.mp3' })).toBe(true);
    expect(isMessengerAudioFilePayload({ kind: 'voice', name: 'voice-1.webm' })).toBe(false);
    expect(isMessengerAudioFilePayload({ name: 'choir.m4a' })).toBe(true);
    expect(isMessengerAudioFilePayload({ name: 'voice-99.ogg' })).toBe(false);
  });

  it('builds list preview from description or filename', () => {
    expect(messengerAudioListPreview('Молитва', { kind: 'file', name: 'x.mp3' })).toBe('Молитва');
    expect(messengerAudioListPreview('', { kind: 'file', name: 'song.mp3' })).toBe('🎵 song.mp3');
    expect(messengerAudioListPreview('', { kind: 'voice' })).toBe('🎤 Голосовое сообщение');
  });

  it('strips extension for display title', () => {
    expect(audioDisplayTitle('Praise.mp3')).toBe('Praise');
    expect(audioDisplayTitle('')).toBe('Аудио');
  });
});
