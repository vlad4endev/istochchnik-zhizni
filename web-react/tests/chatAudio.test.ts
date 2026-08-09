import { describe, expect, it } from 'vitest';

import {
  audioDisplayTitle,
  isChatAudioFile,
  isGeneratedStorageFileName,
  isMessengerAudioFilePayload,
  isVoiceRecordingFileName,
  messengerAudioListPreview,
  parseId3v2Title,
  resolveMessengerAudioFileTitle,
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
    expect(
      isMessengerAudioFilePayload({
        mimeType: 'audio/mpeg',
        name: '1000000123.mp3',
      }),
    ).toBe(true);
  });

  it('builds list preview from description or filename', () => {
    expect(messengerAudioListPreview('Молитва', { kind: 'file', name: 'x.mp3' })).toBe('Молитва');
    expect(messengerAudioListPreview('', { kind: 'file', name: 'song.mp3' })).toBe('🎵 song');
    expect(messengerAudioListPreview('', { kind: 'voice' })).toBe('🎤 Голосовое сообщение');
    expect(
      messengerAudioListPreview('', {
        kind: 'file',
        name: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3',
        title: 'Хор',
      }),
    ).toBe('🎵 Хор');
  });

  it('strips extension for display title and ignores storage uuids', () => {
    expect(audioDisplayTitle('Praise.mp3')).toBe('Praise');
    expect(audioDisplayTitle('')).toBe('Аудио');
    expect(isGeneratedStorageFileName('a1b2c3d4-e5f6-4890-abcd-ef1234567890.mp3')).toBe(true);
    expect(audioDisplayTitle('a1b2c3d4-e5f6-4890-abcd-ef1234567890.mp3')).toBe('Аудиофайл');
  });

  it('resolves best audio title from payload fields', () => {
    expect(
      resolveMessengerAudioFileTitle({
        kind: 'file',
        name: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890.mp3',
        title: 'Пасха',
      }),
    ).toBe('Пасха');
    expect(
      resolveMessengerAudioFileTitle({
        kind: 'file',
        originalName: 'Worship Night.mp3',
      }),
    ).toBe('Worship Night');
  });

  it('parses ID3v2 TIT2 title', () => {
    // Minimal ID3v2.3 tag with one TIT2 frame: "Hello"
    const header = [
      0x49, 0x44, 0x33, // ID3
      0x03, 0x00, // v2.3
      0x00, // flags
      0x00, 0x00, 0x00, 0x10, // size = 16 (syncsafe): TIT2 frame
    ];
    const frame = [
      0x54, 0x49, 0x54, 0x32, // TIT2
      0x00, 0x00, 0x00, 0x06, // size = 6
      0x00, 0x00, // flags
      0x00, // encoding latin1
      0x48, 0x65, 0x6c, 0x6c, 0x6f, // Hello
    ];
    const bytes = Uint8Array.from([...header, ...frame]);
    expect(parseId3v2Title(bytes)).toBe('Hello');
  });
});
