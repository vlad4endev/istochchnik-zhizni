import { describe, expect, it } from 'vitest';

import { meetingTitleFromPreview } from '../src/features/calls/meetingTitle';

describe('meetingTitleFromPreview', () => {
  it('берёт имя шаблона из title', () => {
    expect(
      meetingTitleFromPreview({
        title: 'Вечерняя молитвенная стража',
        mediaType: 'video',
      }),
    ).toBe('Вечерняя молитвенная стража');
  });

  it('падает на conversationTitle для старых ответов API', () => {
    expect(
      meetingTitleFromPreview({
        conversationTitle: 'Утренняя молитвенная стража',
        mediaType: 'audio',
      }),
    ).toBe('Утренняя молитвенная стража');
  });

  it('использует fallback или тип встречи', () => {
    expect(meetingTitleFromPreview({ mediaType: 'video' }, 'Моя встреча')).toBe('Моя встреча');
    expect(meetingTitleFromPreview({ mediaType: 'audio' })).toBe('Аудиовстреча');
    expect(meetingTitleFromPreview(null)).toBe('Видеовстреча');
  });
});
