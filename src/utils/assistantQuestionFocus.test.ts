import assert from 'node:assert/strict';

import {
  clipAssistantTurn,
  extractBibleRefsFromText,
  extractVerseSearchQuery,
  planAssistantContext,
} from './assistantQuestionFocus';

function main(): void {
  const refs = extractBibleRefsFromText('Объясни Ин 3:16 и ещё Рим 8:28, пожалуйста.');
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.book.slug, 'john');
  assert.equal(refs[0]?.chapter, 3);
  assert.equal(refs[0]?.verseStart, 16);
  assert.equal(refs[1]?.book.slug, 'romans');
  assert.equal(refs[1]?.verseStart, 28);

  const range = extractBibleRefsFromText('Разбери 1 Кор 13:4-7');
  assert.equal(range[0]?.book.slug, '1-corinthians');
  assert.equal(range[0]?.verseStart, 4);
  assert.equal(range[0]?.verseEnd, 7);

  assert.equal(extractBibleRefsFromText('Кто такой Иоанн Креститель?').length, 0);
  assert.equal(extractVerseSearchQuery('Найди стих про любовь к ближнему'), 'любовь к ближнему');
  assert.equal(extractVerseSearchQuery('Где в Библии говорится про милость'), 'милость');
  assert.equal(extractVerseSearchQuery('Объясни Ин 3:16'), null);

  const grace = planAssistantContext('Что такое благодать?');
  assert.equal(grace.scripture, true);
  assert.deepEqual(grace.church, []);
  assert.equal(grace.greeting, false);

  const preacher = planAssistantContext('Кто проповедует в это воскресенье?');
  assert.equal(preacher.church.includes('services'), true);
  assert.equal(preacher.church.includes('people'), false);
  assert.equal(preacher.scripture, false);

  const mine = planAssistantContext('Что мне читать дальше?');
  assert.equal(mine.reading, true);
  assert.equal(planAssistantContext('На чём я остановился?').reading, true);

  const hello = planAssistantContext('Мир вам!');
  assert.equal(hello.greeting, true);
  assert.equal(hello.scripture, false);

  const plan = planAssistantContext('Где я остановился в плане чтения?');
  assert.equal(plan.reading, true);

  const song = planAssistantContext('Какие слова у песни Великий Бог?');
  assert.equal(song.church.includes('songs'), true);

  const solomon = planAssistantContext('О чём Песнь Песней 2:4?');
  assert.equal(solomon.refs[0]?.book.slug, 'song-of-solomon');
  assert.equal(solomon.church.includes('songs'), false);
  assert.equal(solomon.scripture, true);

  assert.equal(clipAssistantTurn('абвгд', 1), 'абвгд');
  assert.equal(clipAssistantTurn('я'.repeat(2000), 8).length, 1500);
  assert.equal(clipAssistantTurn('я'.repeat(7000), 1).length, 6000);

  console.log('assistantQuestionFocus (unit) ok');
}

main();
