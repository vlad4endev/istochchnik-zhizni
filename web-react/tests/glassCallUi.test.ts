import { describe, expect, it } from 'vitest';

import { splitGlassTitle } from '../src/features/calls/glassCallUi';

describe('splitGlassTitle', () => {
  it('делит заголовок на первую строку и italic-акцент', () => {
    expect(splitGlassTitle('Вечерняя молитвенная стража')).toEqual({
      head: 'Вечерняя',
      accent: 'молитвенная стража',
    });
  });

  it('для одного слова не добавляет accent', () => {
    expect(splitGlassTitle('Встреча')).toEqual({ head: 'Встреча', accent: '' });
  });
});
