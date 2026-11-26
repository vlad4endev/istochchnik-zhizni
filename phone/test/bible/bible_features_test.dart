import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/bible/audio/bible_audio_player.dart';
import 'package:molitva/features/bible/bible_reader_page.dart';
import 'package:molitva/features/bible/logic/verse_of_day.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:molitva/features/bible/widgets/chapter_view.dart';
import 'package:molitva/features/bible/widgets/verse_of_day_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

Future<void> _size(WidgetTester tester, {double width = 360, double height = 740}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Widget _app(Widget child, {double width = 360, double scale = 1}) => MaterialApp(
      theme: churchTheme(brightness: Brightness.light),
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
        child: child,
      ),
    );

/// Каждый стих отдельной строкой — тогда на каждый можно нажать по отдельности.
void _versePerLine() => SharedPreferences.setMockInitialValues({
      'bible_settings': jsonEncode({'lines': true}),
    });

Future<BibleReaderPage> _reader(
  FakeBibleSource source,
  BiblePlayer player, {
  String slug = 'john',
  int chapter = 3,
}) async =>
    BibleReaderPage(
      source: source,
      books: await source.books('synodal'),
      translations: await source.translations(),
      translation: 'synodal',
      bookSlug: slug,
      chapter: chapter,
      player: player,
    );

Future<void> _tapVerse(WidgetTester tester, int verse) async {
  await tester.tapAt(tester.getTopLeft(find.textContaining('Стих $verse главы 3', findRichText: true)) + const Offset(40, 8));
  await tester.pumpAndSettle();
}

class _Harness {
  _Harness() {
    source = FakeBibleSource();
    backend = FakeBackend();
    player = BiblePlayer(backendFactory: () => backend);
  }

  late final FakeBibleSource source;
  late final FakeBackend backend;
  late final BiblePlayer player;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('закладки в читалке', () {
    testWidgets('выбрали стихи 2–3 → «Закладка»: сохраняется один диапазон, у обоих стихов значок; повторно — «Убрать»', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();

      await _tapVerse(tester, 2);
      await _tapVerse(tester, 3);
      expect(find.text('Стихи: 2–3'), findsOneWidget);
      await tester.tap(find.byTooltip('Закладка'));
      await tester.pumpAndSettle();
      expect(find.text('Закладка добавлена'), findsOneWidget);
      expect(h.source.bookmarkStore.single.verseStart, 2);
      expect(h.source.bookmarkStore.single.verseEnd, 3);
      expect(find.text('Стихи: 2–3'), findsNothing, reason: 'после добавления выбор снимается');
      expect(find.byIcon(Icons.bookmark_rounded), findsNWidgets(2));

      await _tapVerse(tester, 2);
      await _tapVerse(tester, 3);
      expect(find.byTooltip('Убрать закладку'), findsOneWidget);
      await tester.tap(find.byTooltip('Убрать закладку'));
      await tester.pumpAndSettle();
      expect(find.text('Закладка убрана'), findsOneWidget);
      expect(h.source.bookmarkStore, isEmpty);
      expect(find.byIcon(Icons.bookmark_rounded), findsNothing);
    });

    testWidgets('нет сети — понятное сообщение, закладка не появляется, выбор остаётся', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await _tapVerse(tester, 1);
      h.source.online = false;
      await tester.tap(find.byTooltip('Закладка'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось сохранить закладку'), findsOneWidget);
      expect(find.text('Стихи: 1'), findsOneWidget);
      expect(find.byIcon(Icons.bookmark_rounded), findsNothing);
    });

    testWidgets('закладки главы подгружаются при открытии и отмечены значками', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      await h.source.createBookmark(translation: 'synodal', bookSlug: 'john', chapter: 3, verseStart: 4, verseEnd: 4);
      await h.source.createBookmark(translation: 'synodal', bookSlug: 'john', chapter: 4, verseStart: 1, verseEnd: 1);
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.bookmark_rounded), findsOneWidget, reason: 'закладка главы 4 здесь не видна');
    });
  });

  group('озвучка в читалке', () {
    testWidgets('у главы есть запись: «Слушать главу» включает её, мини-плеер ставит на паузу и закрывается', (tester) async {
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      expect(find.text('Слушать главу'), findsOneWidget);
      expect(find.text('Сейчас играет'), findsNothing);

      await tester.tap(find.text('Слушать главу'));
      await tester.pumpAndSettle();
      expect(h.backend.log, contains('load:https://cdn/john3.mp3@0'));
      expect(find.text('Сейчас играет'), findsOneWidget);
      expect(find.text('Синод. · озвучка'), findsOneWidget, reason: 'мини-плеер виден');

      await tester.tap(find.bySemanticsLabel('Пауза').last);
      await tester.pumpAndSettle();
      expect(h.player.status, AudioStatus.paused);
      expect(find.text('Слушать главу'), findsOneWidget);

      await tester.tap(find.byTooltip('Остановить и закрыть'));
      await tester.pumpAndSettle();
      expect(h.player.isActive, isFalse);
      expect(find.text('Синод. · озвучка'), findsNothing);
    });

    testWidgets('нет записи — строки «Слушать» нет, в панели действий нет «Слушать с этого стиха»', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      expect(find.text('Слушать главу'), findsNothing);
      await _tapVerse(tester, 2);
      expect(find.byTooltip('Слушать с этого стиха'), findsNothing);
    });

    testWidgets('«Слушать с этого стиха»: озвучка стартует с секунды выбранного стиха', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await _tapVerse(tester, 2);
      await tester.tap(find.byTooltip('Слушать с этого стиха'));
      await tester.pumpAndSettle();
      expect(h.backend.log.first, 'load:https://cdn/john3.mp3@10500');
      expect(find.text('Стихи: 2'), findsNothing, reason: 'выбор снят');
    });

    testWidgets('читаемый стих подсвечивается: читалка передаёт тексту номер стиха из плеера', (tester) async {
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Слушать главу'));
      await tester.pumpAndSettle();
      h.backend.positionCtl.add(const Duration(seconds: 12));
      await tester.pump();
      expect(tester.widget<ChapterView>(find.byType(ChapterView).first).activeVerse, 2);
      h.backend.positionCtl.add(const Duration(seconds: 2));
      await tester.pump();
      expect(tester.widget<ChapterView>(find.byType(ChapterView).first).activeVerse, 1);
    });

    testWidgets('после конца главы читалка сама листает на следующую и включает её озвучку', (tester) async {
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      h.source.audioByChapter['john:4'] = audioFor('john4');
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Слушать главу'));
      await tester.pumpAndSettle();

      h.backend.completedCtl.add(null);
      await tester.pumpAndSettle();
      expect(find.text('Глава 4'), findsOneWidget, reason: 'экран перелистнулся на главу 4');
      expect(h.backend.log.where((e) => e.startsWith('load')).last, 'load:https://cdn/john4.mp3@0');
      expect(h.player.track?.chapter, 4);
    });

    testWidgets('сбой озвучки показан сообщением, а не молчанием', (tester) async {
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      h.backend.failLoad = true;
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Слушать главу'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось включить озвучку'), findsOneWidget);
    });

    testWidgets('плеер: скорость по кругу, автопереход, таймер сна, перемотка; не переполняется на 320 px и шрифте 200%', (tester) async {
      await _size(tester, width: 320);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.audioByChapter['john:3'] = audioFor('john3');
      await tester.pumpWidget(_app(await _reader(h.source, h.player), width: 320, scale: 2));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Открыть плеер'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('От Иоанна 3'), findsWidgets);

      await tester.tap(find.bySemanticsLabel(RegExp('^Скорость воспроизведения 1×')));
      await tester.pumpAndSettle();
      expect(h.player.rate, 1.25);
      expect(find.text('1,25×'), findsOneWidget);

      await tester.ensureVisible(find.text('До конца главы'));
      await tester.tap(find.text('До конца главы'));
      await tester.pump();
      expect(h.player.sleepKind, SleepKind.chapterEnd);
      await tester.tap(find.text('10 мин'));
      await tester.pump();
      expect(h.player.sleepKind, SleepKind.minutes);
      await tester.tap(find.text('Выкл'));
      await tester.pump();
      expect(h.player.sleepKind, SleepKind.off);

      expect(h.player.autoNext, isTrue);
      await tester.tap(find.bySemanticsLabel('Автоматически включать следующую главу'));
      await tester.pump();
      expect(h.player.autoNext, isFalse);

      h.backend.positionCtl.add(const Duration(seconds: 30));
      await tester.tap(find.byTooltip('Вперёд на 15 секунд'));
      await tester.pump();
      expect(h.backend.log.last, 'seek:45');
      await tester.pumpAndSettle();
    });
  });

  group('комментарии и «Поделиться»', () {
    testWidgets('комментарии к главе показаны под текстом с источником', (tester) async {
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      h.source.commentaryList.addAll(const [
        BibleCommentary(id: 1, fromChurch: false, title: '', body: 'Никодим пришёл ночью.', verseStart: 2),
        BibleCommentary(id: 2, fromChurch: true, title: 'Новое рождение', body: 'О чём говорит Господь.'),
      ]);
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('КОММЕНТАРИИ · 2'), 300, scrollable: find.byType(Scrollable).first);
      expect(find.text('КОММЕНТАРИИ · 2'), findsOneWidget);
      expect(find.text('ЛОПУХИН · СТ. 2'), findsOneWidget);
      expect(find.text('Новое рождение'), findsOneWidget);
    });

    testWidgets('«Поделиться»: открывает системное окно с цитатой; если окна нет — копирует и говорит об этом', (tester) async {
      _versePerLine();
      await _size(tester);
      final h = _Harness();
      addTearDown(h.player.dispose);
      final shared = <Object?>[];
      var available = true;
      final messenger = tester.binding.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(const MethodChannel('church/system'), (call) async {
        if (call.method != 'shareText') return null;
        if (!available) throw PlatformException(code: 'no-share');
        shared.add(call.arguments);
        return null;
      });
      String? clipboard;
      messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') clipboard = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() {
        messenger.setMockMethodCallHandler(const MethodChannel('church/system'), null);
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
      });
      await tester.pumpWidget(_app(await _reader(h.source, h.player)));
      await tester.pumpAndSettle();

      await _tapVerse(tester, 2);
      await tester.tap(find.byTooltip('Поделиться'));
      await tester.pumpAndSettle();
      expect((shared.single as Map)['text'], contains('Стих 2 главы 3'));
      expect((shared.single as Map)['text'], contains('Ин 3:2'));
      expect(find.text('Стихи: 2'), findsNothing);

      available = false;
      await _tapVerse(tester, 3);
      await tester.tap(find.byTooltip('Поделиться'));
      await tester.pumpAndSettle();
      expect(clipboard, contains('Стих 3 главы 3'));
      expect(find.text('Скопировано — можно вставить где угодно'), findsOneWidget);
    });

    for (final width in [320.0, 360.0]) {
      testWidgets('панель действий с шестью кнопками помещается: ширина ${width.round()}, шрифт 200%', (tester) async {
        _versePerLine();
        await _size(tester, width: width);
        final h = _Harness();
        addTearDown(h.player.dispose);
        h.source.audioByChapter['john:3'] = audioFor('john3');
        await tester.pumpWidget(_app(await _reader(h.source, h.player), width: width, scale: 2));
        await tester.pumpAndSettle();
        await tester.tapAt(tester.getTopLeft(find.textContaining('Стих 1 главы 3', findRichText: true)) + const Offset(60, 20));
        await tester.pumpAndSettle();
        expect(find.text('Стихи: 1'), findsOneWidget);
        expect(find.byTooltip('Слушать с этого стиха'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('стих дня', () {
    testWidgets('показывает стих этого дня, открывает его в главе, «Поделиться» копирует, если окна нет', (tester) async {
      await _size(tester);
      final source = FakeBibleSource()..versesPerChapter = 40;
      final books = await source.books('synodal');
      (String, int, int)? opened;
      String? clipboard;
      final messenger = tester.binding.defaultBinaryMessenger;
      // Системного окна «Поделиться» нет — карточка должна скопировать стих в буфер.
      messenger.setMockMethodCallHandler(const MethodChannel('church/system'), (call) async => throw PlatformException(code: 'no-share'));
      messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') clipboard = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() {
        messenger.setMockMethodCallHandler(const MethodChannel('church/system'), null);
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
      });
      await tester.pumpWidget(_app(Scaffold(
        body: VerseOfDayCard(
          source: source,
          translation: BibleTranslation.synodal,
          books: books,
          today: DateTime(2026, 11, 26),
          onOpen: (slug, chapter, verse) => opened = (slug, chapter, verse),
        ),
      )));
      await tester.pumpAndSettle();
      expect(find.text('СТИХ ДНЯ'), findsOneWidget);
      expect(find.text('Стих 10 главы 41'), findsOneWidget);
      expect(find.text('Ис 41:10'), findsOneWidget, reason: '26 ноября 2026 — Исаия 41:10, как на сайте');

      await tester.tap(find.text('Стих 10 главы 41'));
      expect(opened, ('isaiah', 41, 10));

      await tester.tap(find.byTooltip('Поделиться стихом дня'));
      await tester.pumpAndSettle();
      expect(clipboard, '«Стих 10 главы 41» — Ис 41:10 (Синод.)');
      expect(find.text('Стих скопирован'), findsOneWidget);
    });

    testWidgets('диапазон стихов склеивается в один текст и одну ссылку; нет книги в переводе или нет связи — карточки нет', (tester) async {
      await _size(tester);
      final source = FakeBibleSource()..versesPerChapter = 40;
      final books = await source.books('synodal');
      // Первый день 2026 года, на который выпадает диапазон (например, Числа 6:24–25).
      final rangeDay = [for (var d = DateTime(2026, 1, 1); d.year == 2026; d = d.add(const Duration(days: 1))) d].firstWhere((d) => pickVerseOfDay(d).end != null);
      final ref = pickVerseOfDay(rangeDay);
      await tester.pumpWidget(_app(Scaffold(body: VerseOfDayCard(source: source, translation: BibleTranslation.synodal, books: books, today: rangeDay, onOpen: (_, _, _) {}))));
      await tester.pumpAndSettle();
      expect(find.text('СТИХ ДНЯ'), findsOneWidget);
      expect(find.textContaining('${ref.chapter}:${ref.verse}–${ref.last}'), findsOneWidget);
      expect(find.textContaining('Стих ${ref.verse} главы ${ref.chapter} Стих ${ref.last} главы ${ref.chapter}'), findsOneWidget);

      final ntOnly = [for (final b in books) if (b.isNewTestament) b];
      await tester.pumpWidget(_app(Scaffold(body: VerseOfDayCard(key: UniqueKey(), source: source, translation: BibleTranslation.synodal, books: ntOnly, today: DateTime(2026, 1, 1), onOpen: (_, _, _) {}))));
      await tester.pumpAndSettle();
      expect(find.text('СТИХ ДНЯ'), findsNothing, reason: 'Второзаконие в переводе только Нового Завета нет');

      source.online = false;
      await tester.pumpWidget(_app(Scaffold(body: VerseOfDayCard(key: UniqueKey(), source: source, translation: BibleTranslation.synodal, books: books, today: DateTime(2026, 1, 1), onOpen: (_, _, _) {}))));
      await tester.pumpAndSettle();
      expect(find.text('СТИХ ДНЯ'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
