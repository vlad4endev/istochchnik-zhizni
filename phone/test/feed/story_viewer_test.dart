import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/feed/logic/story_logic.dart';
import 'package:molitva/features/feed/models/feed_models.dart';
import 'package:molitva/features/feed/story_viewer.dart';
import 'package:provider/provider.dart';

import 'fake_feed.dart';

/// Время идёт кадрами, как на телефоне: сначала короткий кадр (таймер анимации стартует), потом нужный отрезок.
Future<void> elapse(WidgetTester tester, Duration d) async {
  await tester.pump(const Duration(milliseconds: 16));
  await tester.pump(d);
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('логика историй', () {
    test('тап слева — назад, справа — вперёд', () {
      expect(storyTapZone(50, 360), StoryTap.previous);
      expect(storyTapZone(119, 360), StoryTap.previous);
      expect(storyTapZone(121, 360), StoryTap.next);
      expect(storyTapZone(300, 360), StoryTap.next);
    });

    test('порядок просмотра: своя, затем чужие; начинаем с нажатой', () {
      final mine = storyGroup(9, 'Я', [story('1', by: 9)], me: true);
      final a = storyGroup(2, 'Анна', [story('2')]);
      final b = storyGroup(3, 'Пётр', [story('3', by: 3)]);
      final p = storyPlaylist(mine: mine, others: [a, b], tapped: b);
      expect(p.groups.map((g) => g.author.label), ['Я', 'Анна', 'Пётр']);
      expect(p.start, 2);
      expect(storyPlaylist(mine: null, others: [a], tapped: a).start, 0);
    });

    test('сколько осталось жить истории', () {
      final now = DateTime(2026, 11, 22, 12);
      expect(storyTimeLeft(now.add(const Duration(hours: 5, minutes: 10)), now: now), 'ещё 5 ч');
      expect(storyTimeLeft(now.add(const Duration(minutes: 40)), now: now), 'ещё 40 мин');
      expect(storyTimeLeft(now.subtract(const Duration(minutes: 1)), now: now), '');
      expect(storyTimeLeft(null), '');
    });
  });

  group('просмотр', () {
    late FakeFeed feed;
    late List<String> seen;
    late List<String> deleted;

    setUp(() {
      feed = FakeFeed();
      seen = [];
      deleted = [];
    });

    Future<void> openViewer(WidgetTester tester, List<StoryGroup> groups, {int start = 0, double width = 360, double scale = 1}) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final session = SessionController()..user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.dark),
          home: MediaQuery(
            data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(scale)),
            child: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => StoryViewerPage(groups: groups, start: start, source: feed, meId: 9, onSeen: (a, s) => seen.add('$a:$s'), onDeleted: deleted.add),
                  )),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));
    }

    final viewer = find.byType(StoryViewerPage);
    Future<void> tapRight(WidgetTester tester) async => tester.tapAt(const Offset(300, 400));
    Future<void> tapLeft(WidgetTester tester) async => tester.tapAt(const Offset(40, 400));

    testWidgets('начинает с первой непросмотренной; полоски по числу историй; просмотр отмечается', (tester) async {
      final g = storyGroup(2, 'Анна Орлова', [story('1', viewed: true), story('2'), story('3')]);
      await openViewer(tester, [g]);
      expect(find.text('Анна Орлова'), findsOneWidget);
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
      expect(seen, ['2:2']);
      final segments = tester.widget<Row>(find.byKey(const ValueKey('story-segments')));
      expect(segments.children, hasLength(3));
    });

    testWidgets('тап справа — следующая, слева — предыдущая; отметка просмотра один раз на историю', (tester) async {
      final g = storyGroup(2, 'Анна', [story('1'), story('2'), story('3')]);
      await openViewer(tester, [g]);
      await tapRight(tester);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
      await tapRight(tester);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const ValueKey('story-image-3')), findsOneWidget);
      await tapLeft(tester);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
      expect(seen, ['2:1', '2:2', '2:3'], reason: 'возврат на вторую историю повторно не отмечается');
    });

    testWidgets('фото само сменяется через 5 секунд; после последней просмотр закрывается', (tester) async {
      final g = storyGroup(2, 'Анна', [story('1'), story('2')]);
      await openViewer(tester, [g]);
      await elapse(tester, const Duration(milliseconds: 4000));
      expect(find.byKey(const ValueKey('story-image-1')), findsOneWidget, reason: 'за 4 секунды ещё первая');
      await elapse(tester, const Duration(milliseconds: 1500));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
      await elapse(tester, const Duration(seconds: 6));
      await tester.pumpAndSettle();
      expect(viewer, findsNothing);
    });

    testWidgets('удержание ставит на паузу, отпускание — продолжает', (tester) async {
      final g = storyGroup(2, 'Анна', [story('1'), story('2')]);
      await openViewer(tester, [g]);
      final hold = await tester.startGesture(const Offset(180, 400));
      await tester.pump(const Duration(milliseconds: 700));
      await elapse(tester, const Duration(seconds: 8));
      expect(find.byKey(const ValueKey('story-image-1')), findsOneWidget, reason: 'пока держим — не листается');
      await hold.up();
      await elapse(tester, const Duration(seconds: 6));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
    });

    testWidgets('закончились истории одного автора — открывается следующий', (tester) async {
      final a = storyGroup(2, 'Анна Орлова', [story('1')]);
      final b = storyGroup(3, 'Пётр Иванов', [story('2', by: 3)]);
      await openViewer(tester, [a, b]);
      expect(find.text('Анна Орлова'), findsOneWidget);
      await elapse(tester, const Duration(milliseconds: 5200));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.text('Пётр Иванов'), findsOneWidget);
      expect(seen, ['2:1', '3:2']);
    });

    testWidgets('свайп вниз закрывает просмотр', (tester) async {
      await openViewer(tester, [storyGroup(2, 'Анна', [story('1')])]);
      await tester.fling(find.byKey(const ValueKey('story-surface')), const Offset(0, 500), 1500);
      await tester.pumpAndSettle();
      expect(viewer, findsNothing);
    });

    testWidgets('крестик закрывает просмотр', (tester) async {
      await openViewer(tester, [storyGroup(2, 'Анна', [story('1')])]);
      await tester.tap(find.byKey(const ValueKey('story-close')));
      await tester.pumpAndSettle();
      expect(viewer, findsNothing);
    });

    testWidgets('фото не загрузилось — подсказка, просмотр не зависает и идёт дальше', (tester) async {
      await openViewer(tester, [storyGroup(2, 'Анна', [story('1'), story('2')])]);
      expect(find.byKey(const ValueKey('story-failed')), findsOneWidget);
      await elapse(tester, const Duration(milliseconds: 5200));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
    });

    testWidgets('видео не открылось — понятный текст, дальше по таймеру', (tester) async {
      await openViewer(tester, [storyGroup(2, 'Анна', [story('1', video: true), story('2')])]);
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Не удалось загрузить видео'), findsOneWidget);
      await elapse(tester, const Duration(milliseconds: 5300));
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
    });

    testWidgets('подпись истории показывается поверх', (tester) async {
      await openViewer(tester, [storyGroup(2, 'Анна', [story('1', caption: 'Воскресное служение')])]);
      expect(find.text('Воскресное служение'), findsOneWidget);
    });
  });

  group('ответ и реакции', () {
    late FakeFeed feed;
    setUp(() => feed = FakeFeed());

    Future<void> open(WidgetTester tester, List<StoryGroup> groups, {double width = 360, double scale = 1}) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final session = SessionController()..user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.dark),
          home: MediaQuery(data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(scale)), child: StoryViewerPage(groups: groups, start: 0, source: feed, meId: 9, onSeen: (_, _) {}, onDeleted: (_) {})),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 100));
    }

    testWidgets('реакция уходит автору в чат; видно подтверждение', (tester) async {
      await open(tester, [storyGroup(2, 'Анна', [story('7')])]);
      await tester.tap(find.byKey(const ValueKey('reaction-🔥')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(feed.calls, contains('reply:7::🔥'));
      expect(find.byKey(const ValueKey('story-flash')), findsOneWidget);
      expect(find.text('Реакция отправлена в чат'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
    });

    testWidgets('текстовый ответ: поле, кнопка «Отправить», подтверждение; поле очищается', (tester) async {
      await open(tester, [storyGroup(2, 'Анна', [story('7')])]);
      expect(find.byKey(const ValueKey('story-reply-send')), findsNothing);
      await tester.enterText(find.byKey(const ValueKey('story-reply-field')), 'Красивое фото!');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('story-reply-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(feed.calls, contains('reply:7:Красивое фото!:'));
      expect(find.text('Ответ отправлен в чат'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('story-reply-field'))).controller!.text, isEmpty);
      await tester.pump(const Duration(seconds: 2));
    });

    testWidgets('пока вводите ответ, истории не листаются', (tester) async {
      await open(tester, [storyGroup(2, 'Анна', [story('1'), story('2')])]);
      await tester.tap(find.byKey(const ValueKey('story-reply-field')));
      await tester.pump(const Duration(seconds: 8));
      expect(find.byKey(const ValueKey('story-image-1')), findsOneWidget);
    });

    testWidgets('ошибка отправки — сообщение, текст не теряется', (tester) async {
      feed.failAction = true;
      await open(tester, [storyGroup(2, 'Анна', [story('7')])]);
      await tester.enterText(find.byKey(const ValueKey('story-reply-field')), 'Привет');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('story-reply-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('не вышло'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('story-reply-field'))).controller!.text, 'Привет');
    });

    testWidgets('у своей истории ответа и реакций нет, есть удаление', (tester) async {
      await open(tester, [storyGroup(9, 'Я', [story('7', by: 9)], me: true)]);
      expect(find.byKey(const ValueKey('story-reply-field')), findsNothing);
      expect(find.byKey(const ValueKey('story-delete')), findsOneWidget);
      expect(find.text('Ваша история'), findsOneWidget);
    });

    testWidgets('удаление своей: подтверждение; «Отмена» ничего не трогает; «Удалить» убирает историю и закрывает, если она последняя', (tester) async {
      final deleted = <String>[];
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final session = SessionController()..user = AppUser(id: 9, name: 'М', firstName: 'М', lastName: 'Л', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.dark),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => StoryViewerPage(groups: [storyGroup(9, 'Я', [story('7', by: 9)], me: true)], start: 0, source: feed, meId: 9, onSeen: (_, _) {}, onDeleted: deleted.add))),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const ValueKey('story-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('story-delete-cancel')));
      await tester.pump(const Duration(milliseconds: 400)); // не pumpAndSettle: он «домотал» бы 5-секундный таймер истории
      expect(feed.calls.where((c) => c.startsWith('delStory')), isEmpty);
      await tester.tap(find.byKey(const ValueKey('story-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('story-delete-ok')));
      await tester.pumpAndSettle();
      expect(feed.calls, contains('delStory:7'));
      expect(deleted, ['7']);
      expect(find.byType(StoryViewerPage), findsNothing);
    });

    testWidgets('удалили одну из нескольких — остальные остаются', (tester) async {
      await open(tester, [storyGroup(9, 'Я', [story('1', by: 9), story('2', by: 9)], me: true)]);
      await tester.tap(find.byKey(const ValueKey('story-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('story-delete-ok')));
      await tester.pumpAndSettle();
      expect(find.byType(StoryViewerPage), findsOneWidget);
      expect(find.byKey(const ValueKey('story-image-2')), findsOneWidget);
    });

    testWidgets('вёрстка на 320 px и шрифте 2.0 — без переполнений', (tester) async {
      await open(tester, [storyGroup(2, 'Анна Орлова-Сидорова из молодёжной группы', [story('1', caption: 'Длинная подпись к истории, которая занимает несколько строк на узком экране')])], width: 320, scale: 2);
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.takeException(), isNull);
    });
  });
}
