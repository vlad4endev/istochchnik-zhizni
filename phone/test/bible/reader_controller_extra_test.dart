import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/bible/audio/bible_audio_player.dart';
import 'package:molitva/features/bible/bible_reader_controller.dart';
import 'package:molitva/features/bible/bible_store.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

Future<({BibleReaderController c, FakeBibleSource source, FakeBackend backend, BiblePlayer player})> _make({String slug = 'john', int chapter = 3, Map<String, BibleAudio> audio = const {}}) async {
  final source = FakeBibleSource()..audioByChapter.addAll(audio);
  final backend = FakeBackend();
  final player = BiblePlayer(backendFactory: () => backend);
  final c = BibleReaderController(
    source: source,
    store: BibleStore(),
    books: await source.books('synodal'),
    translation: 'synodal',
    bookSlug: slug,
    chapter: chapter,
    saveDelay: Duration.zero,
    translations: await source.translations(),
    audio: player,
  );
  await c.init();
  return (c: c, source: source, backend: backend, player: player);
}

Future<void> _settle() => pumpEventQueue();

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('закладки', () {
    test('подряд идущие стихи — одна закладка-диапазон; несвязные — по одной на группу; выбор снимается', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await _settle();
      t.c.selected.addAll([1, 2, 3, 5]);
      expect(await t.c.toggleBookmarkSelected(), BookmarkResult.added);
      expect(t.source.bookmarkStore.map((b) => (b.verseStart, b.verseEnd)), [(1, 3), (5, 5)]);
      expect(t.c.selected, isEmpty);
      expect(t.c.bookmarkedVersesAt(t.c.page), {1, 2, 3, 5});
    });

    test('повторное нажатие на тот же выбор убирает закладки; «Убрать» видно только при точном совпадении', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await _settle();
      t.c.selected.addAll([2, 3]);
      await t.c.toggleBookmarkSelected();
      t.c.selected.addAll([2, 3]);
      expect(t.c.selectionBookmarked, isTrue);
      expect(await t.c.toggleBookmarkSelected(), BookmarkResult.removed);
      expect(t.source.bookmarkStore, isEmpty);
      expect(t.c.bookmarkedVersesAt(t.c.page), isEmpty);

      t.c.selected
        ..clear()
        ..add(2);
      await t.c.toggleBookmarkSelected();
      t.c.selected
        ..clear()
        ..addAll([2, 3]);
      expect(t.c.selectionBookmarked, isFalse, reason: 'закладка только на стих 2 — выбор 2–3 ей не равен');
    });

    test('сбой сети не создаёт закладку и не снимает выбор; без выбора — ошибка использования', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await _settle();
      t.c.selected.add(4);
      t.source.online = false;
      await expectLater(t.c.toggleBookmarkSelected(), throwsA(isA<Exception>()));
      expect(t.c.selected, {4});
      expect(t.c.bookmarksAt(t.c.page), isEmpty);
      t.c.selected.clear();
      await expectLater(t.c.toggleBookmarkSelected(), throwsA(isA<StateError>()));
    });

    test('закладки подгружаются для открытой главы и не смешиваются с другими главами', () async {
      final source = FakeBibleSource();
      await source.createBookmark(translation: 'synodal', bookSlug: 'john', chapter: 3, verseStart: 16, verseEnd: 16);
      await source.createBookmark(translation: 'synodal', bookSlug: 'john', chapter: 5, verseStart: 1, verseEnd: 1);
      final c = BibleReaderController(
        source: source,
        store: BibleStore(),
        books: await source.books('synodal'),
        translation: 'synodal',
        bookSlug: 'john',
        chapter: 3,
        audio: BiblePlayer(backendFactory: FakeBackend.new),
      );
      addTearDown(c.dispose);
      await c.init();
      await _settle();
      expect(c.bookmarkedVersesAt(c.page), {16});
    });
  });

  group('комментарии', () {
    test('загружаются к главе; без сети читать можно — просто без комментариев', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      t.source.commentaryList.add(const BibleCommentary(id: 1, fromChurch: true, title: 'Т', body: 'Б'));
      await t.c.loadCommentaries(t.c.page);
      expect(t.c.commentariesAt(t.c.page).single.sourceLabel, 'Церковь');

      final offline = await _make(chapter: 4);
      addTearDown(offline.c.dispose);
      addTearDown(offline.player.dispose);
      offline.source.online = false;
      await offline.c.loadCommentaries(offline.c.page + 1);
      expect(offline.c.commentariesAt(offline.c.page + 1), isEmpty);
    });
  });

  group('озвучка главы', () {
    test('записи нет — listen() сообщает false и ничего не включает', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      expect(await t.c.listen(), isFalse);
      expect(t.player.isActive, isFalse);
      expect(t.c.hasAudioAt(t.c.page), isFalse);
    });

    test('запись есть — известна заранее, listen() включает главу с подписью перевода; isPlayingPage различает главы', () async {
      final t = await _make(audio: {'john:3': audioFor('john3')});
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await t.c.audioAt(t.c.page);
      await _settle();
      expect(t.c.hasAudioAt(t.c.page), isTrue);

      expect(await t.c.listen(), isTrue);
      expect(t.player.track?.title, 'От Иоанна 3');
      expect(t.player.track?.translationTitle, 'Синод.');
      expect(t.c.isPlayingPage(t.c.page), isTrue);
      expect(t.c.isPlayingPage(t.c.page + 1), isFalse);
    });

    test('«слушать со стиха»: плеер стартует с секунды этого стиха', () async {
      final t = await _make(audio: {'john:3': audioFor('john3')});
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await t.c.listen(fromVerse: 2);
      expect(t.backend.log.first, 'load:https://cdn/john3.mp3@10500');
    });

    test('временный обрыв сети не запоминается как «записи нет»: при следующем обращении сервер спросят заново', () async {
      final source = FakeBibleSource(online: false)..audioByChapter['john:3'] = audioFor('john3');
      final player = BiblePlayer(backendFactory: FakeBackend.new);
      final c = BibleReaderController(source: source, store: BibleStore(), books: await source.books('synodal'), translation: 'synodal', bookSlug: 'john', chapter: 3, audio: player);
      addTearDown(c.dispose);
      addTearDown(player.dispose);
      await c.init();
      await _settle();
      expect(c.hasAudioAt(c.page), isFalse);
      source.online = true;
      expect(await c.audioAt(c.page), isNotNull, reason: 'сеть вернулась — запись нашлась');
      await _settle();
      expect(c.hasAudioAt(c.page), isTrue);
    });

    test('ответ об озвучке запоминается: сервер не спрашивают дважды', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await t.c.audioAt(t.c.page);
      await t.c.audioAt(t.c.page);
      expect(t.source.audioCalls.where((e) => e == 'john:3'), hasLength(1));
    });

    test('плееру отдаются книги и источник — чтобы он сам включил следующую главу, когда читалка закрыта', () async {
      final t = await _make();
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      expect(t.player.books, hasLength(66));
      expect(t.player.source, same(t.source));
    });

    test('смена перевода сбрасывает сведения об озвучке, закладках и комментариях прежнего перевода', () async {
      final t = await _make(audio: {'john:3': audioFor('john3')});
      addTearDown(t.c.dispose);
      addTearDown(t.player.dispose);
      await t.c.audioAt(t.c.page);
      await _settle();
      expect(t.c.hasAudioAt(t.c.page), isTrue);
      final nt = (await t.source.translations()).firstWhere((x) => x.code == 'nt');
      await t.c.switchTranslation(nt);
      await _settle();
      expect(t.source.audioCalls.where((e) => e == 'john:3').length, greaterThanOrEqualTo(2), reason: 'для нового перевода спросили заново');
      expect(t.c.bookmarksAt(t.c.page), isEmpty);
    });
  });
}
