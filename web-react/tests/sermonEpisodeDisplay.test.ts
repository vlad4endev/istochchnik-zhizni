import { describe, expect, it } from 'vitest';

import {
  episodeDisplayDescription,
  isBoilerplateDescription,
  parseEpisodeTitle,
} from '../src/features/resources/utils/sermonEpisodeDisplay';

describe('parseEpisodeTitle', () => {
  it('splits topic and author on pipe', () => {
    expect(parseEpisodeTitle('Как сохранить мир в церкви | Александр Харлашкин')).toEqual({
      topic: 'Как сохранить мир в церкви',
      author: 'Александр Харлашкин',
    });
  });

  it('returns full title when no author separator', () => {
    expect(parseEpisodeTitle('Обычная тема без автора')).toEqual({
      topic: 'Обычная тема без автора',
      author: null,
    });
  });
});

describe('isBoilerplateDescription', () => {
  it('detects social CTA boilerplate', () => {
    expect(
      isBoilerplateDescription(
        'Присоединяйтесь к нам в соц. сетях и будьте в курсе актуальной информации',
      ),
    ).toBe(true);
  });

  it('treats feed description duplicates as boilerplate', () => {
    const feed = 'Официальный подкаст церкви';
    expect(isBoilerplateDescription(feed, feed)).toBe(true);
  });

  it('keeps unique sermon descriptions', () => {
    expect(
      isBoilerplateDescription(
        'Размышление о мире в церкви и о том, как сохранять единство в общине.',
        'Официальный подкаст',
      ),
    ).toBe(false);
  });
});

describe('episodeDisplayDescription', () => {
  it('returns null for social boilerplate', () => {
    expect(
      episodeDisplayDescription(
        'Присоединяйтесь к нам в соц. сетях и будьте в курсе актуальной информаци',
      ),
    ).toBeNull();
  });

  it('returns trimmed unique text', () => {
    expect(episodeDisplayDescription('  Уникальный текст проповеди.  ')).toBe(
      'Уникальный текст проповеди.',
    );
  });
});
