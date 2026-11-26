import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/bible/audio/bible_audio_player.dart';
import 'package:molitva/features/bible/bible_page.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:molitva/features/bible/models/plan_models.dart';
import 'package:molitva/features/bible/notes_page.dart';
import 'package:molitva/features/bible/plans_page.dart';
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

BibleBookmark _bm(int id, int start, int end, {int chapter = 3}) => BibleBookmark(
      id: id,
      translation: 'synodal',
      bookSlug: 'john',
      bookName: 'От Иоанна',
      shortName: 'Ин',
      chapter: chapter,
      verseStart: start,
      verseEnd: end,
      createdAt: DateTime(2026, 11, id),
    );

BibleNote _note(int id) => BibleNote(
      id: id,
      translation: 'synodal',
      bookSlug: 'john',
      bookName: 'От Иоанна',
      shortName: 'Ин',
      chapter: 1,
      verseStart: 1,
      verseEnd: 1,
      body: 'В начале было Слово',
      updatedAt: DateTime(2026, 11, id),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('главная Библии', () {
    testWidgets('плитки «Заметки», «Закладки», «Планы»; «Закладки» открывает вкладку закладок', (tester) async {
      await _size(tester);
      final source = FakeBibleSource();
      source.bookmarkStore.add(_bm(1, 16, 17));
      await tester.pumpWidget(_app(BiblePage(source: source, player: BiblePlayer(backendFactory: FakeBackend.new))));
      await tester.pumpAndSettle();
      expect(find.text('Заметки'), findsOneWidget);
      expect(find.text('Закладки'), findsOneWidget);
      expect(find.text('Планы'), findsOneWidget);

      await tester.tap(find.text('Закладки'));
      await tester.pumpAndSettle();
      expect(find.text('Ин 3:16–17'), findsOneWidget, reason: 'открыта вкладка закладок, а не заметок');
      expect(find.text('От Иоанна'), findsWidgets);
    });

    testWidgets('«Планы» открывают список планов', (tester) async {
      await _size(tester);
      await tester.pumpWidget(_app(BiblePage(source: FakeBibleSource(), player: BiblePlayer(backendFactory: FakeBackend.new))));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Планы'));
      await tester.pumpAndSettle();
      expect(find.text('Планов пока нет'), findsOneWidget);
    });

    testWidgets('стих дня виден, когда текст доступен', (tester) async {
      await _size(tester);
      final source = FakeBibleSource()..versesPerChapter = 200;
      await tester.pumpWidget(_app(BiblePage(source: source, player: BiblePlayer(backendFactory: FakeBackend.new))));
      await tester.pumpAndSettle();
      expect(find.text('СТИХ ДНЯ'), findsOneWidget);
    });

    testWidgets('пока звучит озвучка, на главной мини-плеер: пауза и закрытие; потом пропадает', (tester) async {
      await _size(tester);
      final backend = FakeBackend();
      final player = BiblePlayer(backendFactory: () => backend);
      addTearDown(player.dispose);
      await player.playChapter(trackOf('john', 3));
      await tester.pumpWidget(_app(BiblePage(source: FakeBibleSource(), player: player)));
      await tester.pumpAndSettle();
      expect(find.text('От Иоанна 3'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Пауза'));
      await tester.pumpAndSettle();
      expect(player.status, AudioStatus.paused);
      await tester.tap(find.byTooltip('Остановить и закрыть'));
      await tester.pumpAndSettle();
      expect(find.text('От Иоанна 3'), findsNothing);
      expect(player.isActive, isFalse);
    });
  });

  group('заметки и закладки', () {
    Future<void> open(WidgetTester tester, {required List<BibleNote> notes, required List<BibleBookmark> bookmarks, Future<void> Function(BibleBookmark)? delete, SavedTab tab = SavedTab.notes, void Function(BibleBookmark)? onOpen}) async {
      await tester.pumpWidget(_app(BibleNotesPage(
        load: () async => notes,
        onOpen: (_) {},
        loadBookmarks: () async => bookmarks,
        onOpenBookmark: onOpen ?? (_) {},
        deleteBookmark: delete,
        initialTab: tab,
      )));
      await tester.pumpAndSettle();
    }

    testWidgets('две вкладки со счётчиками; переключение показывает нужный список', (tester) async {
      await _size(tester);
      await open(tester, notes: [_note(1), _note(2)], bookmarks: [_bm(1, 16, 16)]);
      expect(find.text('Заметки · 2'), findsOneWidget);
      expect(find.text('Закладки · 1'), findsOneWidget);
      expect(find.text('В начале было Слово'), findsNWidgets(2));
      await tester.tap(find.text('Закладки · 1'));
      await tester.pumpAndSettle();
      expect(find.text('Ин 3:16'), findsOneWidget);
      expect(find.text('В начале было Слово'), findsNothing);
    });

    testWidgets('пустые вкладки объясняют, что делать', (tester) async {
      await _size(tester);
      await open(tester, notes: const [], bookmarks: const []);
      expect(find.text('Заметок пока нет'), findsOneWidget);
      await tester.tap(find.text('Закладки'));
      await tester.pumpAndSettle();
      expect(find.text('Закладок пока нет'), findsOneWidget);
      expect(find.textContaining('нажмите на стих'), findsOneWidget);
    });

    testWidgets('нажатие на закладку открывает место; удаление убирает строку, сбой удаления оставляет её и говорит об этом', (tester) async {
      await _size(tester);
      BibleBookmark? opened;
      var fail = false;
      await open(
        tester,
        notes: const [],
        bookmarks: [_bm(1, 16, 16), _bm(2, 1, 3)],
        tab: SavedTab.bookmarks,
        onOpen: (b) => opened = b,
        delete: (b) async {
          if (fail) throw Exception('нет сети');
        },
      );
      await tester.tap(find.text('Ин 3:1–3'));
      expect(opened?.id, 2);

      fail = true;
      await tester.tap(find.byTooltip('Удалить закладку Ин 3:1–3'));
      await tester.pumpAndSettle();
      expect(find.text('Ин 3:1–3'), findsOneWidget);
      expect(find.textContaining('Не удалось удалить закладку'), findsOneWidget);

      fail = false;
      await tester.tap(find.byTooltip('Удалить закладку Ин 3:1–3'));
      await tester.pumpAndSettle();
      expect(find.text('Ин 3:1–3'), findsNothing);
      expect(find.text('Закладка удалена'), findsOneWidget);
      expect(find.text('Ин 3:16'), findsOneWidget);
    });

    testWidgets('без загрузчика закладок страница остаётся страницей заметок, без вкладок', (tester) async {
      await _size(tester);
      await tester.pumpWidget(_app(BibleNotesPage(load: () async => [_note(1)], onOpen: (_) {})));
      await tester.pumpAndSettle();
      expect(find.text('Мои заметки'), findsOneWidget);
      expect(find.text('Закладки'), findsNothing);
    });

    testWidgets('вёрстка вкладок на 320 px и шрифте 200%', (tester) async {
      await _size(tester, width: 320);
      await tester.pumpWidget(_app(
        BibleNotesPage(load: () async => [_note(1)], onOpen: (_) {}, loadBookmarks: () async => [_bm(1, 16, 18)], onOpenBookmark: (_) {}, deleteBookmark: (_) async {}),
        width: 320,
        scale: 2,
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Закладки'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('планы чтения', () {
    Future<List<PlanRef>> openPlans(WidgetTester tester, FakeBibleSource source, {double width = 360, double scale = 1}) async {
      final opened = <PlanRef>[];
      await tester.pumpWidget(_app(BiblePlansPage(source: source, onOpenRef: opened.add), width: width, scale: scale));
      await tester.pumpAndSettle();
      return opened;
    }

    testWidgets('пустой список → «Составить план»: цель по умолчанию, выбор дней, план создан и открыт; в списке виден прогресс', (tester) async {
      await _size(tester);
      final source = FakeBibleSource();
      await openPlans(tester, source);
      expect(find.text('Планов пока нет'), findsOneWidget);
      await tester.tap(find.text('Составить план'));
      await tester.pumpAndSettle();
      expect(find.text('Новый план чтения'), findsOneWidget);
      await tester.tap(find.text('Новый Завет за 90 дней'));
      await tester.pump();
      await tester.tap(find.text('7'));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('plan-create')));
      await tester.pumpAndSettle();

      expect(source.planStore.single.goal, 'Новый Завет за 90 дней');
      expect(source.planStore.single.daysTotal, 7);
      expect(find.text('ЧИТАТЬ СЕЙЧАС'), findsOneWidget, reason: 'открылся созданный план');
      expect(find.text('День 1'), findsWidgets);

      await tester.tap(find.byTooltip('Назад').evaluate().isEmpty ? find.byIcon(Icons.arrow_back_ios_new_rounded) : find.byTooltip('Назад'));
      await tester.pumpAndSettle();
      expect(find.textContaining('План: Новый Завет за 90 дней'), findsOneWidget);
      expect(find.text('0 из 7 дней'), findsOneWidget);
    });

    testWidgets('не удалось составить план: причина на экране, кнопка снова доступна', (tester) async {
      await _size(tester);
      final source = FakeBibleSource(online: false);
      source.online = true;
      await openPlans(tester, source);
      await tester.tap(find.text('Составить план'));
      await tester.pumpAndSettle();
      source.online = false;
      await tester.tap(find.byKey(const ValueKey('plan-create')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('plan-problem')), findsOneWidget);
      expect(find.text('Составить план'), findsWidgets);
      expect(source.planStore, isEmpty);
    });

    testWidgets('план: «Прочитано» отмечает день и двигает прогресс; ссылка открывает чтение; сбой возвращает отметку', (tester) async {
      await _size(tester);
      final source = FakeBibleSource();
      final plan = await source.generatePlan(goal: 'Иоанн', days: 3);
      final opened = <PlanRef>[];
      await tester.pumpWidget(_app(BiblePlanPage(source: source, planId: plan.id, onOpenRef: opened.add)));
      await tester.pumpAndSettle();
      expect(find.text('0 из 3 дней'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('plan-mark-next')));
      await tester.pumpAndSettle();
      expect(find.text('1 из 3 дней'), findsOneWidget);
      expect(source.planStore.single.daysCompleted, 1);
      expect(find.text('День 2'), findsWidgets, reason: 'теперь «читать сейчас» — второй день');

      await tester.tap(find.text('Ин 2').first);
      expect(opened.single.chapter, 2);

      source.online = false;
      await tester.tap(find.byKey(const ValueKey('plan-check-2')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось сохранить отметку'), findsOneWidget);
      expect(find.text('1 из 3 дней'), findsOneWidget, reason: 'отметка откатилась');

      source.online = true;
      await tester.tap(find.byKey(const ValueKey('plan-check-1')));
      await tester.pumpAndSettle();
      expect(find.text('0 из 3 дней'), findsOneWidget, reason: 'день можно и снять');
    });

    testWidgets('прочитан последний день — «план прочитан целиком»', (tester) async {
      await _size(tester);
      final source = FakeBibleSource();
      final plan = await source.generatePlan(goal: 'Иоанн', days: 1);
      await tester.pumpWidget(_app(BiblePlanPage(source: source, planId: plan.id, onOpenRef: (_) {})));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('plan-mark-next')));
      await tester.pumpAndSettle();
      expect(find.text('План прочитан целиком'), findsOneWidget);
      expect(find.text('План прочитан целиком — слава Богу!'), findsOneWidget);
      expect(find.text('ЧИТАТЬ СЕЙЧАС'), findsNothing);
    });

    testWidgets('удаление плана: подтверждение; «Оставить» ничего не меняет, «Удалить» убирает и возвращает к списку', (tester) async {
      await _size(tester);
      final source = FakeBibleSource();
      await source.generatePlan(goal: 'Иоанн', days: 2);
      await openPlans(tester, source);
      await tester.tap(find.textContaining('План: Иоанн'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Удалить план'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить план?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('plan-keep')));
      await tester.pumpAndSettle();
      expect(source.planStore, hasLength(1));

      await tester.tap(find.byTooltip('Удалить план'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('plan-delete')));
      await tester.pumpAndSettle();
      expect(source.planStore, isEmpty);
      expect(find.text('Планов пока нет'), findsOneWidget);
    });

    testWidgets('сети нет — список планов показывает ошибку с «Повторить»', (tester) async {
      await _size(tester);
      final source = FakeBibleSource(online: false);
      await openPlans(tester, source);
      expect(find.text('Планов пока нет'), findsNothing);
      source.online = true;
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(find.text('Планов пока нет'), findsOneWidget);
    });

    for (final width in [320.0, 360.0]) {
      testWidgets('вёрстка плана и создания на ширине ${width.round()} при шрифте 200%', (tester) async {
        await _size(tester, width: width);
        final source = FakeBibleSource();
        final plan = await source.generatePlan(goal: 'Вся Библия за год — длинная формулировка цели для проверки переноса строк', days: 30);
        await tester.pumpWidget(_app(BiblePlanPage(source: source, planId: plan.id, onOpenRef: (_) {}), width: width, scale: 2));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        await tester.pumpWidget(_app(BiblePlansPage(key: UniqueKey(), source: source, onOpenRef: (_) {}), width: width, scale: 2));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Новый план'));
        await tester.pumpAndSettle();
        expect(find.text('Новый план чтения'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
