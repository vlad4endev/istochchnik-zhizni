import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/bible/data/book_catalog.dart';
import 'package:molitva/features/bible/logic/bible_ref.dart';
import 'package:molitva/features/bible/logic/chapter_index.dart';
import 'package:molitva/features/bible/logic/quote.dart';
import 'package:molitva/features/bible/models/bible_models.dart';

void main() {
  group('ссылки', () {
    test('простые и составные ссылки', () {
      final r = parseBibleRef('Ин 3:16')!;
      expect(r.book.slug, 'john');
      expect((r.chapter, r.verseStart, r.verseEnd), (3, 16, null));
      expect(parseBibleRef('Иоанна 3:16-18')!.label, 'Ин 3:16–18');
      expect(parseBibleRef('1 Кор 13')!.book.slug, '1-corinthians');
      expect(parseBibleRef('1Кор.13:4-7')!.verseEnd, 7);
      expect(parseBibleRef('Пс 22')!.book.slug, 'psalms');
      expect(parseBibleRef('john 3:16')!.book.slug, 'john');
    });

    test('без пробела, с регистром, точкой и ё', () {
      expect(parseBibleRef('ин3:16')!.chapter, 3);
      expect(parseBibleRef('ИОАННА 1.1')!.verseStart, 1);
      expect(parseBibleRef('Быт. 1')!.book.slug, 'genesis');
    });

    test('несуществующее не принимаем', () {
      expect(parseBibleRef('Ин 99'), isNull, reason: 'в Иоанна 21 глава');
      expect(parseBibleRef('Ин 3:0'), isNull);
      expect(parseBibleRef('Ин 3:16-5'), isNull);
      expect(parseBibleRef('привет 3'), isNull);
      expect(parseBibleRef(''), isNull);
      expect(parseBibleRef('Ин'), isNull);
    });

    test('все 66 книг находятся по своему названию и сокращению', () {
      for (final def in bibleBooks) {
        expect(findBook(def.name)?.slug, def.slug, reason: def.name);
        expect(findBook(def.shortName)?.slug, def.slug, reason: def.shortName);
        expect(parseBibleRef('${def.shortName} 1')?.book.slug, def.slug, reason: '${def.shortName} 1');
      }
      expect(bibleBooks.length, 66);
    });

    test('поиск книги по началу названия', () {
      expect(booksByPrefix('иоан').map((b) => b.slug), containsAll(['john', '1-john', '2-john', '3-john']));
      expect(booksByPrefix('ри').map((b) => b.slug), contains('romans'));
      expect(booksByPrefix('и'), isEmpty);
    });

    test('что ввёл человек', () {
      expect(BibleQuery.parse('').kind, BibleQueryKind.empty);
      expect(BibleQuery.parse('Ин 3:16').kind, BibleQueryKind.reference);
      expect(BibleQuery.parse('рим').kind, BibleQueryKind.books);
      expect(BibleQuery.parse('возлюбил Бог мир').kind, BibleQueryKind.text);
      expect(BibleQuery.parse('любовь').kind, BibleQueryKind.text);
      expect(BibleQuery.parse('Лев 99').kind, BibleQueryKind.badChapter);
      expect(BibleQuery.parse('Лев 99').books.single.slug, 'leviticus');
      expect(BibleQuery.parse('привет 3').kind, BibleQueryKind.text);
    });
  });

  group('цитата', () {
    test('диапазоны стихов', () {
      expect(verseRanges([16, 17, 18, 20]), '16–18, 20');
      expect(verseRanges([5]), '5');
      expect(verseRanges([3, 1, 2]), '1–3');
      expect(verseRanges(const []), '');
    });

    test('один стих и несколько', () {
      expect(
        formatQuote(bookShortName: 'Ин', chapter: 3, verses: const [Verse(16, 'Ибо так возлюбил Бог мир')]),
        '«Ибо так возлюбил Бог мир»\n— Ин 3:16',
      );
      expect(
        formatQuote(bookShortName: 'Ин', chapter: 3, verses: const [Verse(17, 'Б'), Verse(16, 'А')]),
        '16 А\n17 Б\n— Ин 3:16–17',
      );
    });
  });

  group('лента глав', () {
    final all = ChapterIndex([for (final d in bibleBooks) BibleBook.fromDef(d)]);
    final nt = ChapterIndex([for (final d in bibleBooks) if (d.isNewTestament) BibleBook.fromDef(d)]);

    test('1189 глав, границы книг', () {
      expect(all.count, 1189);
      expect(all.at(0).book.slug, 'genesis');
      expect(all.at(all.count - 1).book.slug, 'revelation');
      expect(all.at(all.count - 1).chapter, 22);
      final lastGenesis = all.indexOf('genesis', 50)!;
      expect(all.at(lastGenesis + 1).book.slug, 'exodus');
      expect(all.at(lastGenesis + 1).chapter, 1);
    });

    test('туда и обратно для любой главы', () {
      for (var i = 0; i < all.count; i++) {
        final e = all.at(i);
        expect(all.indexOf(e.book.slug, e.chapter), i);
      }
    });

    test('в переводе Нового Завета нет Ветхого', () {
      expect(nt.indexOf('genesis', 1), isNull);
      expect(nt.at(0).book.slug, 'matthew');
      expect(nt.count, 260);
    });

    test('глава за пределами книги прижимается к краю', () {
      expect(all.indexOf('john', 999), all.indexOf('john', 21));
    });
  });
}
