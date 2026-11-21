// Сгенерировано из src/bible/bibleBookCatalog.ts (66 книг, синодальный порядок). Не править руками.

/// Книга Библии: идентификатор на сервере, названия и варианты написания для разбора ссылок.
class BookDef {
  const BookDef(this.slug, this.ord, this.isNewTestament, this.name, this.shortName, this.chapters, this.aliases);

  final String slug;
  final int ord;
  final bool isNewTestament;
  final String name;
  final String shortName;
  final int chapters;
  final List<String> aliases;
}

const bibleBooks = <BookDef>[
  BookDef('genesis', 1, false, 'Бытие', 'Быт', 50, ['бытие', 'быт', 'бт', 'gen', 'genesis', 'ge', 'gn']),
  BookDef('exodus', 2, false, 'Исход', 'Исх', 40, ['исход', 'исх', 'ex', 'exodus', 'exo']),
  BookDef('leviticus', 3, false, 'Левит', 'Лев', 27, ['левит', 'лев', 'lev', 'leviticus', 'le']),
  BookDef('numbers', 4, false, 'Числа', 'Чис', 36, ['числа', 'чис', 'num', 'numbers', 'nu', 'nm']),
  BookDef('deuteronomy', 5, false, 'Второзаконие', 'Втор', 34, ['второзаконие', 'втор', 'deut', 'deuteronomy', 'dt', 'de']),
  BookDef('joshua', 6, false, 'Иисус Навин', 'Нав', 24, ['навин', 'нав', 'иснав', 'ииснав', 'joshua', 'josh', 'jos']),
  BookDef('judges', 7, false, 'Судьи', 'Суд', 21, ['судьи', 'суд', 'judges', 'judg', 'jdg']),
  BookDef('ruth', 8, false, 'Руфь', 'Руф', 4, ['руфь', 'руф', 'ruth', 'ru']),
  BookDef('1-samuel', 9, false, '1 Царств', '1Цар', 31, ['1царств', '1цар', '1ц', '1samuel', '1sam', '1sa', '1 царств', '1 цар']),
  BookDef('2-samuel', 10, false, '2 Царств', '2Цар', 24, ['2царств', '2цар', '2ц', '2samuel', '2sam', '2sa', '2 царств', '2 цар']),
  BookDef('1-kings', 11, false, '3 Царств', '3Цар', 22, ['3царств', '3цар', '3ц', '1kings', '1kgs', '1ki', '3 царств', '3 цар']),
  BookDef('2-kings', 12, false, '4 Царств', '4Цар', 25, ['4царств', '4цар', '4ц', '2kings', '2kgs', '2ki', '4 царств', '4 цар']),
  BookDef('1-chronicles', 13, false, '1 Паралипоменон', '1Пар', 29, ['1пар', '1паралипоменон', '1chr', '1chronicles', '1ch', '1 пар']),
  BookDef('2-chronicles', 14, false, '2 Паралипоменон', '2Пар', 36, ['2пар', '2паралипоменон', '2chr', '2chronicles', '2ch', '2 пар']),
  BookDef('ezra', 15, false, 'Ездра', 'Езд', 10, ['ездра', 'езд', 'ezra', 'ezr']),
  BookDef('nehemiah', 16, false, 'Неемия', 'Неем', 13, ['неемия', 'неем', 'neh', 'nehemiah']),
  BookDef('esther', 17, false, 'Есфирь', 'Есф', 10, ['есфирь', 'есф', 'est', 'esther']),
  BookDef('job', 18, false, 'Иов', 'Иов', 42, ['иов', 'job']),
  BookDef('psalms', 19, false, 'Псалтирь', 'Пс', 150, ['псалтирь', 'псалтырь', 'псалом', 'пс', 'ps', 'psalm', 'psalms', 'psa']),
  BookDef('proverbs', 20, false, 'Притчи', 'Прит', 31, ['притчи', 'прит', 'prov', 'proverbs', 'pr']),
  BookDef('ecclesiastes', 21, false, 'Екклесиаст', 'Еккл', 12, ['екклесиаст', 'еккл', 'ecc', 'ecclesiastes', 'eccl']),
  BookDef('song-of-solomon', 22, false, 'Песнь Песней', 'Песн', 8, ['песнь', 'песн', 'пп', 'song', 'sos', 'cant']),
  BookDef('isaiah', 23, false, 'Исаия', 'Ис', 66, ['исаия', 'ис', 'isa', 'isaiah']),
  BookDef('jeremiah', 24, false, 'Иеремия', 'Иер', 52, ['иеремия', 'иер', 'jer', 'jeremiah']),
  BookDef('lamentations', 25, false, 'Плач Иеремии', 'Плач', 5, ['плач', 'lam', 'lamentations']),
  BookDef('ezekiel', 26, false, 'Иезекииль', 'Иез', 48, ['иезекииль', 'иез', 'ezek', 'ezekiel', 'eze']),
  BookDef('daniel', 27, false, 'Даниил', 'Дан', 12, ['даниил', 'дан', 'dan', 'daniel']),
  BookDef('hosea', 28, false, 'Осия', 'Ос', 14, ['осия', 'ос', 'hos', 'hosea']),
  BookDef('joel', 29, false, 'Иоиль', 'Иоил', 3, ['иоиль', 'иоил', 'joel', 'jol']),
  BookDef('amos', 30, false, 'Амос', 'Ам', 9, ['амос', 'ам', 'amos', 'amo']),
  BookDef('obadiah', 31, false, 'Авдий', 'Авд', 1, ['авдий', 'авд', 'obad', 'obadiah', 'oba']),
  BookDef('jonah', 32, false, 'Иона', 'Ион', 4, ['иона', 'ион', 'jonah', 'jon']),
  BookDef('micah', 33, false, 'Михей', 'Мих', 7, ['михей', 'мих', 'mic', 'micah']),
  BookDef('nahum', 34, false, 'Наум', 'Наум', 3, ['наум', 'nah', 'nahum']),
  BookDef('habakkuk', 35, false, 'Аввакум', 'Авв', 3, ['аввакум', 'авв', 'hab', 'habakkuk']),
  BookDef('zephaniah', 36, false, 'Софония', 'Соф', 3, ['софония', 'соф', 'zeph', 'zephaniah', 'zep']),
  BookDef('haggai', 37, false, 'Аггей', 'Агг', 2, ['аггей', 'агг', 'hag', 'haggai']),
  BookDef('zechariah', 38, false, 'Захария', 'Зах', 14, ['захария', 'зах', 'zech', 'zechariah', 'zec']),
  BookDef('malachi', 39, false, 'Малахия', 'Мал', 4, ['малахия', 'мал', 'mal', 'malachi']),
  BookDef('matthew', 40, true, 'От Матфея', 'Мф', 28, ['матфея', 'матфей', 'мф', 'мт', 'matt', 'matthew', 'mt', 'мат']),
  BookDef('mark', 41, true, 'От Марка', 'Мк', 16, ['марка', 'марк', 'мк', 'мр', 'mark', 'mk', 'mr']),
  BookDef('luke', 42, true, 'От Луки', 'Лк', 24, ['луки', 'лука', 'лк', 'luke', 'lk', 'lu']),
  BookDef('john', 43, true, 'От Иоанна', 'Ин', 21, ['иоанна', 'иоанн', 'ин', 'john', 'jn', 'joh']),
  BookDef('acts', 44, true, 'Деяния', 'Деян', 28, ['деяния', 'деян', 'acts', 'act', 'ac']),
  BookDef('romans', 45, true, 'К Римлянам', 'Рим', 16, ['римлянам', 'рим', 'rom', 'romans', 'ro']),
  BookDef('1-corinthians', 46, true, '1 Коринфянам', '1Кор', 16, ['1коринфянам', '1кор', '1cor', '1corinthians', '1co', '1 кор']),
  BookDef('2-corinthians', 47, true, '2 Коринфянам', '2Кор', 13, ['2коринфянам', '2кор', '2cor', '2corinthians', '2co', '2 кор']),
  BookDef('galatians', 48, true, 'К Галатам', 'Гал', 6, ['галатам', 'гал', 'gal', 'galatians']),
  BookDef('ephesians', 49, true, 'К Ефесянам', 'Еф', 6, ['ефесянам', 'еф', 'eph', 'ephesians']),
  BookDef('philippians', 50, true, 'К Филиппийцам', 'Флп', 4, ['филиппийцам', 'флп', 'phil', 'philippians', 'php']),
  BookDef('colossians', 51, true, 'К Колоссянам', 'Кол', 4, ['колоссянам', 'кол', 'col', 'colossians']),
  BookDef('1-thessalonians', 52, true, '1 Фессалоникийцам', '1Фес', 5, ['1фессалоникийцам', '1фес', '1thess', '1th', '1 фес']),
  BookDef('2-thessalonians', 53, true, '2 Фессалоникийцам', '2Фес', 3, ['2фессалоникийцам', '2фес', '2thess', '2th', '2 фес']),
  BookDef('1-timothy', 54, true, '1 Тимофею', '1Тим', 6, ['1тимофею', '1тим', '1tim', '1ti', '1 тим']),
  BookDef('2-timothy', 55, true, '2 Тимофею', '2Тим', 4, ['2тимофею', '2тим', '2tim', '2ti', '2 тим']),
  BookDef('titus', 56, true, 'К Титу', 'Тит', 3, ['титу', 'тит', 'tit', 'titus']),
  BookDef('philemon', 57, true, 'К Филимону', 'Флм', 1, ['филимону', 'флм', 'phlm', 'philemon', 'phm']),
  BookDef('hebrews', 58, true, 'К Евреям', 'Евр', 13, ['евреям', 'евр', 'heb', 'hebrews']),
  BookDef('james', 59, true, 'Иакова', 'Иак', 5, ['иакова', 'иак', 'jas', 'james', 'jam']),
  BookDef('1-peter', 60, true, '1 Петра', '1Пет', 5, ['1петра', '1пет', '1pet', '1pe', '1 пет']),
  BookDef('2-peter', 61, true, '2 Петра', '2Пет', 3, ['2петра', '2пет', '2pet', '2pe', '2 пет']),
  BookDef('1-john', 62, true, '1 Иоанна', '1Ин', 5, ['1иоанна', '1ин', '1john', '1jn', '1 ин', '1иоан']),
  BookDef('2-john', 63, true, '2 Иоанна', '2Ин', 1, ['2иоанна', '2ин', '2john', '2jn', '2 ин']),
  BookDef('3-john', 64, true, '3 Иоанна', '3Ин', 1, ['3иоанна', '3ин', '3john', '3jn', '3 ин']),
  BookDef('jude', 65, true, 'Иуды', 'Иуд', 1, ['иуды', 'иуд', 'jude', 'jud']),
  BookDef('revelation', 66, true, 'Откровение', 'Откр', 22, ['откровение', 'откр', 'rev', 'revelation', 're']),
];
