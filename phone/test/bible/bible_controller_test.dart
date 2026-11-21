import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/bible/bible_controller.dart';
import 'package:molitva/features/bible/bible_reader_controller.dart';
import 'package:molitva/features/bible/bible_store.dart';
import 'package:molitva/features/bible/logic/bible_ref.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

Future<BibleReaderController> _reader(FakeBibleSource source, {String slug = 'john', int chapter = 3, Duration saveDelay = Duration.zero}) async {
  final books = await source.books('synodal');
  final c = BibleReaderController(
    source: source,
    store: BibleStore(),
    books: books,
    translation: 'synodal',
    bookSlug: slug,
    chapter: chapter,
    saveDelay: saveDelay,
  );
  await c.init();
  return c;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('главный экран', () {
    test('загружает книги и переводы, место чтения пустое', () async {
      final c = BibleController(FakeBibleSource());
      await c.load();
      expect(c.loading, isFalse);
      expect(c.books.length, 66);
      expect(c.position, isNull);
      expect(c.booksOf(newTestament: true).length, 27);
      expect(c.booksOf(newTestament: false).length, 39);
    });

    test('помнит перевод и место чтения между запусками', () async {
      final first = BibleController(FakeBibleSource());
      await first.load();
      await first.setTranslation('nt');
      await first.remember(ReadingPosition(translation: 'nt', bookSlug: 'john', chapter: 3, savedAt: DateTime.now()));

      final second = BibleController(FakeBibleSource());
      await second.load();
      expect(second.translationCode, 'nt');
      expect(second.position?.label, 'Ин 3');
      expect(second.recent.length, 1);
    });

    test('место чтения с сервера подхватывается, только если оно новее', () async {
      final older = DateTime(2026, 1, 1);
      final newer = DateTime(2026, 6, 1);
      SharedPreferences.setMockInitialValues({});
      final store = BibleStore();
      await store.remember(ReadingPosition(translation: 'synodal', bookSlug: 'luke', chapter: 2, savedAt: DateTime(2026, 3, 1)));

      final source = FakeBibleSource()..remotePosition = ReadingPosition(translation: 'synodal', bookSlug: 'mark', chapter: 1, savedAt: older);
      final c1 = BibleController(source);
      await c1.load();
      await Future<void>.delayed(Duration.zero);
      expect(c1.position?.bookSlug, 'luke', reason: 'на телефоне запись новее');

      source.remotePosition = ReadingPosition(translation: 'synodal', bookSlug: 'mark', chapter: 1, savedAt: newer);
      final c2 = BibleController(source);
      await c2.load();
      await Future<void>.delayed(Duration.zero);
      expect(c2.position?.bookSlug, 'mark');
    });

    test('при смене на перевод Нового Завета место из Ветхого сбрасывается', () async {
      final c = BibleController(FakeBibleSource());
      await c.load();
      await c.remember(ReadingPosition(translation: 'synodal', bookSlug: 'genesis', chapter: 1, savedAt: DateTime.now()));
      await c.setTranslation('nt');
      expect(c.position, isNull);
      expect(c.books.length, 27);
    });

    test('ссылка не ходит на сервер, текст — ходит с задержкой и один раз', () {
      fakeAsync((async) {
        final source = FakeBibleSource()
          ..searchResult = const [VerseHit(bookSlug: 'john', shortName: 'Ин', chapter: 3, verse: 16, text: 'Ибо так возлюбил')];
        final c = BibleController(source, searchDelay: const Duration(milliseconds: 300));
        c.load();
        async.flushMicrotasks();

        c.setQuery('Ин 3:16');
        async.elapse(const Duration(seconds: 1));
        expect(c.query.kind, BibleQueryKind.reference);
        expect(source.searchCalls, 0);

        for (final typed in ['воз', 'возл', 'возлюбил']) {
          c.setQuery(typed);
          async.elapse(const Duration(milliseconds: 100));
        }
        expect(source.searchCalls, 0, reason: 'печатает — ждём');
        async.elapse(const Duration(milliseconds: 400));
        async.flushMicrotasks();
        expect(source.searchCalls, 1);
        expect(c.hits.single.reference, 'Ин 3:16');
        expect(c.searching, isFalse);
      });
    });

    test('поиск без сети объясняет, что делать', () {
      fakeAsync((async) {
        final source = FakeBibleSource(online: false);
        final c = BibleController(source, searchDelay: Duration.zero);
        c.load();
        async.flushMicrotasks();
        c.setQuery('любовь');
        async.elapse(const Duration(milliseconds: 10));
        async.flushMicrotasks();
        expect(c.searchError, contains('без сети'));
        expect(c.searching, isFalse);
      });
    });
  });

  group('читалка', () {
    test('листание через границу книги', () async {
      final c = await _reader(FakeBibleSource(), slug: 'genesis', chapter: 50);
      expect(c.title, 'Бытие 50');
      c.onPageChanged(c.page + 1);
      expect(c.title, 'Исход 1');
      c.onPageChanged(c.page - 1);
      expect(c.title, 'Бытие 50');
    });

    test('глава загружается один раз, соседние подгружаются заранее', () async {
      final source = FakeBibleSource();
      final c = await _reader(source);
      await c.chapterAt(c.page);
      await c.chapterAt(c.page);
      await Future<void>.delayed(Duration.zero);
      expect(source.chapterCalls, 3, reason: 'текущая и две соседние');
    });

    test('после сбоя сети глава загружается повторно', () async {
      final source = FakeBibleSource(online: false);
      final c = await _reader(source);
      await expectLater(c.chapterAt(c.page), throwsException);
      source.online = true;
      c.retry(c.page);
      expect((await c.chapterAt(c.page)).verses.length, 5);
    });

    test('место чтения сохраняется после остановки, а не на каждый свайп', () {
      fakeAsync((async) {
        final source = FakeBibleSource();
        late BibleReaderController c;
        source.books('synodal').then((books) {
          c = BibleReaderController(
            source: source,
            store: BibleStore(),
            books: books,
            translation: 'synodal',
            bookSlug: 'john',
            chapter: 1,
            saveDelay: const Duration(seconds: 1),
          );
        });
        async.flushMicrotasks();
        c.onPageChanged(c.page + 1);
        c.onPageChanged(c.page + 1);
        c.onPageChanged(c.page + 1);
        async.elapse(const Duration(milliseconds: 500));
        expect(source.savedPositions, isEmpty);
        async.elapse(const Duration(seconds: 2));
        async.flushMicrotasks();
        expect(source.savedPositions.length, 1);
        expect(source.savedPositions.single.chapter, 4);
      });
    });

    test('закрытие экрана не теряет последнюю остановку', () async {
      final source = FakeBibleSource();
      final c = await _reader(source, saveDelay: const Duration(minutes: 5));
      c.onPageChanged(c.page + 2);
      c.dispose();
      await Future<void>.delayed(Duration.zero);
      expect(source.savedPositions.single.chapter, 5);
    });

    test('выбор стихов и цитата', () async {
      final c = await _reader(FakeBibleSource());
      c.toggleVerse(2);
      c.toggleVerse(3);
      c.toggleVerse(5);
      expect(await c.selectedQuote(), '2 Стих 2 главы 3\n3 Стих 3 главы 3\n5 Стих 5 главы 3\n— Ин 3:2–3, 5');
      c.toggleVerse(5);
      expect(c.selected, {2, 3});
      c.onPageChanged(c.page + 1);
      expect(c.selected, isEmpty, reason: 'в другой главе выбор сбрасывается');
    });

    test('подсветка включается, выключается и переживает перезапуск', () async {
      final c = await _reader(FakeBibleSource());
      c.toggleVerse(1);
      c.toggleVerse(2);
      await c.toggleHighlightSelected();
      expect(c.highlightsAt(c.page), {1, 2});

      final again = await _reader(FakeBibleSource());
      expect(again.highlightsAt(again.page), {1, 2});
      again.toggleVerse(1);
      expect(again.selectionAllHighlighted, isTrue);
      await again.toggleHighlightSelected();
      expect(again.highlightsAt(again.page), {2});
    });

    test('заметки: создать, изменить, удалить, и ошибка сети не теряет выбор', () async {
      final source = FakeBibleSource();
      final c = await _reader(source);
      c.toggleVerse(16);
      final note = await c.addNote('  Главный стих  ');
      expect(note.body, 'Главный стих');
      expect(c.notesAt(c.page).single.verseStart, 16);
      expect(c.selected, isEmpty);

      await c.editNote(note, 'Правка');
      expect(c.notesAt(c.page).single.body, 'Правка');

      source.online = false;
      c.toggleVerse(3);
      await expectLater(c.addNote('Без сети'), throwsException);
      expect(c.selected, {3}, reason: 'выбор остаётся — можно повторить');
      await expectLater(c.removeNote(c.notesAt(c.page).single), throwsException);
      expect(c.notesAt(c.page).length, 1);

      source.online = true;
      await c.removeNote(c.notesAt(c.page).single);
      expect(c.notesAt(c.page), isEmpty);
    });

    test('смена на перевод Нового Завета из Ветхого уводит в начало', () async {
      final source = FakeBibleSource();
      final c = await _reader(source, slug: 'genesis', chapter: 3);
      await c.switchTranslation(source.translationList.last);
      expect(c.title, 'От Матфея 1');
    });

    test('настройки ограничены и запоминаются', () async {
      final c = await _reader(FakeBibleSource());
      await c.updateSettings(c.settings.copyWith(fontSize: 99, theme: BibleTheme.black, verseLines: true));
      expect(c.settings.fontSize, BibleSettings.maxFont);
      final again = await _reader(FakeBibleSource());
      expect(again.settings.theme, BibleTheme.black);
      expect(again.settings.verseLines, isTrue);
    });
  });
}
