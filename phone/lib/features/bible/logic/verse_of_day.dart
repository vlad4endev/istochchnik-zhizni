/// Стих или несколько стихов подряд.
class VerseRef {
  const VerseRef(this.book, this.chapter, this.verse, [this.end]);

  final String book;
  final int chapter;
  final int verse;

  /// Последний стих диапазона (включительно); null — один стих.
  final int? end;

  int get last => end ?? verse;
}

/// Ободряющие стихи для карточки «Стих дня». Тот же список, что на сайте, — чтобы у всех один и тот же стих.
/// Ссылки в синодальной нумерации (псалмы со сдвигом относительно английской).
const verseOfDayList = <VerseRef>[
  VerseRef('genesis', 1, 1),
  VerseRef('numbers', 6, 24, 25),
  VerseRef('deuteronomy', 6, 5),
  VerseRef('joshua', 1, 9),
  VerseRef('job', 19, 25),
  VerseRef('psalms', 1, 1, 2),
  VerseRef('psalms', 22, 1),
  VerseRef('psalms', 22, 4),
  VerseRef('psalms', 26, 1),
  VerseRef('psalms', 31, 8),
  VerseRef('psalms', 36, 5),
  VerseRef('psalms', 41, 2),
  VerseRef('psalms', 50, 12),
  VerseRef('psalms', 54, 23),
  VerseRef('psalms', 62, 2),
  VerseRef('psalms', 72, 26),
  VerseRef('psalms', 90, 1, 2),
  VerseRef('psalms', 90, 11),
  VerseRef('psalms', 99, 5),
  VerseRef('psalms', 102, 1),
  VerseRef('psalms', 118, 105),
  VerseRef('psalms', 118, 114),
  VerseRef('psalms', 120, 1, 2),
  VerseRef('psalms', 138, 23, 24),
  VerseRef('psalms', 145, 18),
  VerseRef('proverbs', 3, 5, 6),
  VerseRef('proverbs', 16, 3),
  VerseRef('proverbs', 18, 10),
  VerseRef('proverbs', 22, 6),
  VerseRef('ecclesiastes', 3, 1),
  VerseRef('isaiah', 40, 31),
  VerseRef('isaiah', 41, 10),
  VerseRef('isaiah', 53, 5),
  VerseRef('jeremiah', 29, 11),
  VerseRef('jeremiah', 33, 3),
  VerseRef('lamentations', 3, 22, 23),
  VerseRef('daniel', 12, 3),
  VerseRef('matthew', 5, 3),
  VerseRef('matthew', 6, 33),
  VerseRef('matthew', 11, 28),
  VerseRef('matthew', 22, 37, 38),
  VerseRef('matthew', 28, 19, 20),
  VerseRef('mark', 12, 30),
  VerseRef('luke', 6, 31),
  VerseRef('john', 1, 1),
  VerseRef('john', 3, 16),
  VerseRef('john', 8, 32),
  VerseRef('john', 13, 34),
  VerseRef('john', 14, 1),
  VerseRef('john', 14, 6),
  VerseRef('john', 14, 27),
  VerseRef('john', 15, 12),
  VerseRef('acts', 1, 8),
  VerseRef('romans', 5, 8),
  VerseRef('romans', 8, 28),
  VerseRef('romans', 8, 31),
  VerseRef('romans', 10, 9),
  VerseRef('romans', 12, 2),
  VerseRef('1-corinthians', 13, 4),
  VerseRef('1-corinthians', 13, 13),
  VerseRef('2-corinthians', 5, 17),
  VerseRef('galatians', 5, 22, 23),
  VerseRef('ephesians', 2, 8),
  VerseRef('ephesians', 6, 11),
  VerseRef('philippians', 4, 6, 7),
  VerseRef('philippians', 4, 13),
  VerseRef('colossians', 3, 23),
  VerseRef('1-thessalonians', 5, 16, 18),
  VerseRef('2-timothy', 1, 7),
  VerseRef('hebrews', 11, 1),
  VerseRef('hebrews', 13, 5),
  VerseRef('james', 1, 5),
  VerseRef('1-peter', 5, 7),
  VerseRef('1-john', 1, 9),
  VerseRef('revelation', 3, 20),
];

/// Стих дня по местной дате: один и тот же у всех в один день (так же считает сайт).
VerseRef pickVerseOfDay(DateTime date) {
  final start = DateTime(date.year, 1, 0); // 31 декабря прошлого года, как `new Date(year, 0, 0)` в JS
  final dayOfYear = date.difference(start).inMilliseconds ~/ 86400000;
  return verseOfDayList[(dayOfYear + date.year) % verseOfDayList.length];
}
