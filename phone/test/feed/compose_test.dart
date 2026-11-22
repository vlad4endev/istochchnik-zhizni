import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/ui/kit/components.dart';
import 'package:molitva/features/chats/logic/attachment_logic.dart';
import 'package:molitva/features/feed/compose_page.dart';
import 'package:molitva/features/feed/logic/compose_logic.dart';
import 'package:provider/provider.dart';

import 'fake_feed.dart';
import 'feed_page_test.dart' show FakePicker;

PickedAttachment file(String name, {String? mime}) => PickedAttachment(path: '/tmp/$name', name: name, mimeType: mime);

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('логика', () {
    test('опубликовать можно с текстом или хотя бы одним файлом', () {
      expect(canPublishPost(caption: '  ', files: 0), isFalse);
      expect(canPublishPost(caption: 'Привет', files: 0), isTrue);
      expect(canPublishPost(caption: '', files: 1), isTrue);
    });

    test('не больше 10 файлов: лишние отбрасываются и считаются', () {
      final r = clampFiles(List.generate(8, (i) => i), List.generate(5, (i) => 100 + i));
      expect(r.accepted, [100, 101]);
      expect(r.dropped, 3);
      expect(clampFiles(List.generate(10, (i) => i), [1]).dropped, 1);
      expect(clampFiles(const <int>[], [1, 2]).dropped, 0);
    });

    test('слишком большой файл — понятное сообщение; неизвестный размер — пропускаем', () {
      expect(tooLargeMessage('клип.mp4', 150 * 1024 * 1024), contains('150 МБ'));
      expect(tooLargeMessage('клип.mp4', 50 * 1024 * 1024), isNull);
      expect(tooLargeMessage('клип.mp4', null), isNull);
    });

    test('видео по расширению и типу; подпись загрузки', () {
      expect(isVideoFile('a.MP4'), isTrue);
      expect(isVideoFile('a.jpg'), isFalse);
      expect(isVideoFile('noext', 'video/quicktime'), isTrue);
      expect(uploadLabel(null), 'Публикуем…');
      expect(uploadLabel(0.456), 'Загрузка 46%');
    });
  });

  group('запись', () {
    late FakeFeed feed;
    late FakePicker picker;
    bool? result;

    setUp(() {
      feed = FakeFeed();
      picker = FakePicker();
      result = null;
    });

    Future<void> open(WidgetTester tester, {bool story = false, double width = 360, double scale = 1}) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final session = SessionController()..user = AppUser(id: 9, name: 'М', firstName: 'М', lastName: 'Л', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: churchTheme(brightness: story ? Brightness.dark : Brightness.light),
          home: MediaQuery(
            data: MediaQueryData(size: Size(width, 900), textScaler: TextScaler.linear(scale)),
            child: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () async => result = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ComposePage(story: story, source: feed, picker: picker))),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    Finder publishButton() => find.byKey(const ValueKey('compose-publish'));

    testWidgets('пустую запись опубликовать нельзя; с текстом — можно, без файлов', (tester) async {
      await open(tester);
      expect(tester.widget<PrimaryButton>(publishButton()).onPressed, isNull);
      await tester.enterText(find.byKey(const ValueKey('compose-caption')), 'Слава Богу за этот день');
      await tester.pump();
      await tester.tap(publishButton());
      await tester.pumpAndSettle();
      expect(feed.calls, ['create:0:Слава Богу за этот день']);
      expect(result, isTrue);
    });

    testWidgets('выбор из галереи: миниатюры; крестик убирает; камера добавляет', (tester) async {
      picker.galleryNow = [file('a.jpg'), file('b.jpg'), file('c.mp4')];
      picker.photoNow = file('cam.jpg');
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('compose-thumbs')), findsOneWidget);
      expect(find.byKey(const ValueKey('thumb-2')), findsOneWidget);
      expect(find.byIcon(Icons.play_circle_fill_rounded), findsOneWidget, reason: 'видео — со значком');
      await tester.tap(find.byKey(const ValueKey('thumb-remove-0')));
      await tester.pump();
      expect(find.byKey(const ValueKey('thumb-2')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('compose-camera')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('thumb-2')), findsOneWidget);
    });

    testWidgets('больше 10 файлов — лишние пропущены, человек предупреждён', (tester) async {
      picker.galleryNow = [for (var i = 0; i < 12; i++) file('f$i.jpg')];
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const ValueKey('thumb-9')), 200,
          scrollable: find.descendant(of: find.byKey(const ValueKey('compose-thumbs')), matching: find.byType(Scrollable)));
      expect(find.byKey(const ValueKey('thumb-9')), findsOneWidget);
      expect(find.byKey(const ValueKey('thumb-10')), findsNothing);
      expect(find.textContaining('не больше 10'), findsOneWidget);
    });

    testWidgets('публикация с файлами: отправляются все, по порядку, с подписью; прогресс виден', (tester) async {
      picker.galleryNow = [file('a.jpg'), file('b.jpg')];
      feed.gate = Completer<void>();
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('compose-caption')), 'Встреча молодёжи');
      await tester.pump();
      await tester.tap(publishButton());
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const ValueKey('compose-progress')), findsOneWidget);
      expect(find.text('Загрузка 50%'), findsOneWidget);
      feed.gate!.complete();
      await tester.pumpAndSettle();
      expect(feed.calls, ['create:2:Встреча молодёжи']);
      expect(result, isTrue);
    });

    testWidgets('ошибка сервера (например, нет хранилища): текст на экране, выбранное и написанное не потеряно', (tester) async {
      picker.galleryNow = [file('a.jpg')];
      feed.failAction = true;
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('compose-caption')), 'Текст');
      await tester.pump();
      await tester.tap(publishButton());
      await tester.pumpAndSettle();
      expect(find.text('Хранилище файлов не настроено'), findsOneWidget);
      expect(find.byKey(const ValueKey('thumb-0')), findsOneWidget);
      expect(find.text('Текст'), findsOneWidget);
      feed.failAction = false;
      await tester.tap(publishButton());
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });

    testWidgets('двойной тап по «Опубликовать» не создаёт две записи', (tester) async {
      picker.galleryNow = [file('a.jpg')];
      feed.gate = Completer<void>();
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.tap(publishButton());
      await tester.pump();
      await tester.tap(publishButton(), warnIfMissed: false);
      await tester.pump();
      feed.gate!.complete();
      await tester.pumpAndSettle();
      expect(feed.calls.where((c) => c.startsWith('create')), hasLength(1));
    });

    testWidgets('галерея не открылась — понятная причина и путь через «Файлы»', (tester) async {
      picker
        ..fail = true
        ..filesNow = [file('from-files.jpg')];
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось открыть выбор'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('compose-files')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('thumb-0')), findsOneWidget);
      expect(find.textContaining('Не удалось открыть выбор'), findsNothing);
    });

    testWidgets('выйти с несохранённым: спрашиваем; «Остаться» сохраняет, «Выйти» закрывает; с пустым — без вопросов', (tester) async {
      await open(tester);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('open'), findsOneWidget, reason: 'пусто — вышли сразу');
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('compose-caption')), 'Не закончил');
      await tester.pump();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Выйти без публикации?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('compose-stay')));
      await tester.pumpAndSettle();
      expect(find.text('Не закончил'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('compose-leave')));
      await tester.pumpAndSettle();
      expect(find.text('open'), findsOneWidget);
      expect(feed.calls, isEmpty);
    });

    testWidgets('вёрстка записи на 320 px и шрифте 2.0', (tester) async {
      picker.galleryNow = [file('a.jpg'), file('b.mp4')];
      await open(tester, width: 320, scale: 2);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    // ───────────── история ─────────────

    testWidgets('история: выбор → просмотр → подпись → публикация; результат true', (tester) async {
      picker.galleryNow = [file('moment.jpg')];
      await open(tester, story: true);
      expect(find.text('Поделитесь моментом'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      expect(picker.calls, ['gallery:1']);
      await tester.enterText(find.byKey(const ValueKey('compose-caption')), 'Благословенного воскресенья');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('compose-publish')));
      await tester.pumpAndSettle();
      expect(feed.calls, ['createStory:moment.jpg:Благословенного воскресенья']);
      expect(result, isTrue);
    });

    testWidgets('история: «Снять фото» и «Снять видео» (видео — с пометкой «готово»)', (tester) async {
      picker
        ..photoNow = file('cam.jpg')
        ..videoNow = file('clip.mp4', mime: 'video/mp4');
      await open(tester, story: true);
      await tester.tap(find.byKey(const ValueKey('compose-video')));
      await tester.pumpAndSettle();
      expect(find.text('Видео готово к публикации'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('story-compose-replace')));
      await tester.pump();
      expect(find.text('Поделитесь моментом'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('compose-camera')));
      await tester.pumpAndSettle();
      expect(picker.calls, ['video', 'photo']);
    });

    testWidgets('история: ошибка публикации — текст и можно повторить', (tester) async {
      picker.galleryNow = [file('moment.jpg')];
      feed.failAction = true;
      await open(tester, story: true);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('compose-publish')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('story-compose-problem')), findsOneWidget);
      expect(find.text('не вышло'), findsOneWidget);
      feed.failAction = false;
      await tester.tap(find.byKey(const ValueKey('compose-publish')));
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });

    testWidgets('история: закрыть с выбранным — спрашивает; пустой выбор — закрывается сразу', (tester) async {
      picker.galleryNow = [file('moment.jpg')];
      await open(tester, story: true);
      await tester.tap(find.byKey(const ValueKey('story-compose-close')));
      await tester.pumpAndSettle();
      expect(find.text('open'), findsOneWidget);
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('story-compose-close')));
      await tester.pumpAndSettle();
      expect(find.text('Выйти без публикации?'), findsOneWidget);
    });

    testWidgets('история: вёрстка на 320 px и шрифте 2.0', (tester) async {
      picker.galleryNow = [file('moment.jpg')];
      await open(tester, story: true, width: 320, scale: 2);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byKey(const ValueKey('compose-gallery')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });
}
