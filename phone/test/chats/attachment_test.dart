import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/data/attachment_picker.dart';
import 'package:molitva/features/chats/data/lost_attachments.dart';
import 'package:molitva/features/chats/logic/attachment_logic.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/thread_controller.dart';
import 'package:molitva/features/chats/thread_page.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_chat.dart';

PickedAttachment file(String name, {String? mime}) => PickedAttachment(path: '/tmp/$name', name: name, mimeType: mime);

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('тип вложения', () {
    test('по расширению и по типу содержимого; видео уходит как «image» (как на сайте)', () {
      expect(attachmentKind('IMG_001.JPG'), 'image');
      expect(attachmentKind('клип.mov'), 'video');
      expect(attachmentKind('голос.m4a'), 'audio');
      expect(attachmentKind('отчёт.pdf'), 'file');
      expect(attachmentKind('без_расширения', 'video/mp4'), 'video');
      expect(attachmentKind('x.bin', 'image/heic; charset=binary'), 'image');
      expect(payloadTypeFor('a.png'), 'image');
      expect(payloadTypeFor('a.mp4'), 'image');
      expect(payloadTypeFor('a.mp3'), 'audio');
      expect(payloadTypeFor('a.docx'), 'file');
      expect(payloadTypeFor('a.mp4', 'application/octet-stream'), 'image', reason: 'тип содержимого общий — смотрим на расширение');
    });
    test('видео в сообщении: по типу или расширению адреса, но не картинка и не документ', () {
      expect(isVideoPayload(mimeType: 'video/mp4'), isTrue);
      expect(isVideoPayload(url: 'https://cdn/x/clip.MP4?token=1'), isTrue);
      expect(isVideoPayload(mimeType: 'image/jpeg', url: 'https://cdn/a.mp4'), isFalse);
      expect(isVideoPayload(mimeType: '', url: 'https://cdn/a.jpg'), isFalse);
      expect(isVideoPayload(name: 'a.mov'), isTrue);
    });
  });

  group('отправка вложений (контроллер)', () {
    ThreadController make(FakeChat s) => ThreadController(s, conversationId: 'c1', meId: 9);

    test('загрузка и сообщение: тип, имя, адрес и размер из ответа сервера', () async {
      final s = FakeChat();
      final c = make(s);
      final failures = await c.sendAttachments([file('фото.jpg'), file('клип.mp4'), file('отчёт.pdf')]);
      expect(failures, isEmpty);
      expect(s.uploads, ['фото.jpg', 'клип.mp4', 'отчёт.pdf']);
      expect(s.calls.where((x) => x.startsWith('send')), ['send:::image', 'send:::image', 'send:::file']);
      final video = c.messages[1];
      expect(video.payload['mimeType'], 'video/mp4');
      expect(video.payload['url'], 'https://cdn/клип.mp4');
      expect(video.payload['size'], 1234);
      expect(c.uploading, isNull);
      expect(c.sending, isFalse);
    });

    test('прогресс: файл по счёту и доля загрузки доходят до слушателей', () async {
      final s = FakeChat();
      final c = make(s);
      final seen = <String>[];
      c.addListener(() {
        final u = c.uploading;
        if (u != null) seen.add('${u.index}/${u.total}:${u.fraction}');
      });
      await c.sendAttachments([file('a.jpg'), file('b.jpg')]);
      expect(seen, containsAll(['1/2:0.0', '1/2:0.5', '1/2:1.0', '2/2:0.0', '2/2:1.0']));
    });

    test('сбой одного файла не мешает остальным; причина — в тексте ошибки', () async {
      final s = FakeChat()..failUpload['большой.mp4'] = 'Видео не больше 1GB';
      final c = make(s);
      final failures = await c.sendAttachments([file('a.jpg'), file('большой.mp4'), file('b.pdf')]);
      expect(failures, ['Не удалось отправить «большой.mp4»: Видео не больше 1GB']);
      expect(c.messages.map((m) => m.payload['name']), ['a.jpg', 'b.pdf']);
      expect(c.uploading, isNull);
    });

    test('сбой самой отправки сообщения (нет сети) — понятная причина', () async {
      final s = FakeChat()..failSend = true;
      final c = make(s);
      final failures = await c.sendAttachments([file('a.jpg')]);
      expect(failures.single, contains('проверьте интернет'));
      expect(c.messages, isEmpty);
    });

    test('ответ на сообщение прикладывается к первому вложению, дальше сбрасывается', () async {
      final s = FakeChat()..all = [msg('1')];
      final c = make(s);
      await c.load();
      c.startReply(c.messages.first);
      await c.sendAttachments([file('a.jpg'), file('b.jpg')]);
      expect(s.calls.where((x) => x.startsWith('send')), ['send::1:image', 'send:::image']);
      expect(c.replyTo, isNull);
    });

    test('голосовое: тип «audio» и пометка voice', () async {
      final s = FakeChat();
      final c = make(s);
      await c.sendAttachments([file('voice.m4a', mime: 'audio/mp4')], voice: true);
      expect(c.messages.single.payloadType, 'audio');
      expect(c.messages.single.payload['kind'], 'voice');
    });

    test('пустой выбор — ничего; пока идёт загрузка, второй вызов игнорируется', () async {
      final s = FakeChat()..uploadGate = Completer<void>();
      final c = make(s);
      expect(await c.sendAttachments(const []), isEmpty);
      final first = c.sendAttachments([file('a.jpg')]);
      await Future<void>.delayed(Duration.zero);
      expect(c.uploading, isNotNull);
      expect(await c.sendAttachments([file('b.jpg')]), isEmpty);
      s.uploadGate!.complete();
      await first;
      expect(s.uploads, ['a.jpg']);
    });
  });

  group('экран: вложения', () {
    SessionController session() {
      final s = SessionController();
      s.user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      return s;
    }

    Future<void> open(WidgetTester tester, FakeChat chat, FakePicker picker, {double width = 360, double scale = 1, Duration? instantClose}) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session(),
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: MediaQuery(
            data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(scale)),
            child: ThreadPage(key: UniqueKey(), conversationId: 'c1', title: 'Молодёжь', type: 'group', source: chat, picker: picker, events: const Stream.empty(), instantClose: instantClose ?? const Duration(milliseconds: 1500)),
          ),
        ),
      ));
      await tester.pumpAndSettle();
    }

    Future<void> choose(WidgetTester tester, String option) async {
      await tester.tap(find.byTooltip('Прикрепить'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(option));
      await tester.pumpAndSettle();
    }

    testWidgets('выбор, спасённый после выгрузки приложения, уходит сам сразу после открытия чата', (tester) async {
      final chat = FakeChat();
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session(),
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: ThreadPage(
            key: UniqueKey(),
            conversationId: 'c1',
            title: 'Молодёжь',
            type: 'group',
            source: chat,
            picker: FakePicker(),
            events: const Stream.empty(),
            initialAttachments: [file('спасено.jpg'), file('справка.pdf')],
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(chat.uploads, ['спасено.jpg', 'справка.pdf']);
      expect(chat.calls.where((x) => x.startsWith('send')), ['send:::image', 'send:::file']);
    });

    testWidgets('окно выбора открыто — чат запомнен; вернулись нормально — запись стёрта', (tester) async {
      final picker = FakePicker()..filesNow = [file('отчёт.pdf')];
      final opened = Completer<void>();
      final release = Completer<void>();
      final slow = _SlowPicker(picker, opened, release);
      final chat = FakeChat();
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session(),
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: ThreadPage(key: UniqueKey(), conversationId: 'c1', title: 'Молодёжь', type: 'group', source: chat, picker: slow, events: const Stream.empty()),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Прикрепить'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Файл'));
      await tester.pump();
      await opened.future;
      final during = await AttachRecovery.read();
      expect(during?.conversationId, 'c1', reason: 'пока окно открыто, чат записан — на случай выгрузки приложения');
      expect(during?.title, 'Молодёжь');
      release.complete();
      await tester.pumpAndSettle();
      expect(await AttachRecovery.read(), isNull);
      expect(chat.uploads, ['отчёт.pdf']);
    });

    testWidgets('в меню вложений: фото, видео, камера, файл, опрос', (tester) async {
      await open(tester, FakeChat(), FakePicker());
      await tester.tap(find.byTooltip('Прикрепить'));
      await tester.pumpAndSettle();
      for (final t in ['Фото из галереи', 'Видео', 'Снять фото', 'Файл', 'Опрос']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
    });

    testWidgets('несколько фото из галереи уходят по очереди и появляются в чате', (tester) async {
      final chat = FakeChat();
      final picker = FakePicker()..photosNow = [file('one.jpg'), file('two.png')];
      await open(tester, chat, picker);
      await choose(tester, 'Фото из галереи');
      expect(picker.calls, ['photos']);
      expect(chat.uploads, ['one.jpg', 'two.png']);
      expect(chat.calls.where((c) => c.startsWith('send')), ['send:::image', 'send:::image']);
      expect(find.byType(Image), findsNWidgets(2));
    });

    testWidgets('видео: уходит как «image» с типом video/mp4 и показывается плиткой «Открыть видео»', (tester) async {
      final chat = FakeChat();
      final picker = FakePicker()..videoNow = file('клип.mp4');
      await open(tester, chat, picker);
      await choose(tester, 'Видео');
      expect(chat.uploads, ['клип.mp4']);
      expect(chat.all.single.payloadType, 'image');
      expect(chat.all.single.payload['mimeType'], 'video/mp4');
      expect(find.byIcon(Icons.play_circle_fill_rounded), findsOneWidget);
      expect(find.text('клип.mp4'), findsOneWidget);
    });

    testWidgets('файл: отправляется, в чате — название файла', (tester) async {
      final chat = FakeChat();
      final picker = FakePicker()..filesNow = [file('Отчёт.pdf')];
      await open(tester, chat, picker);
      await choose(tester, 'Файл');
      expect(chat.all.single.payloadType, 'file');
      expect(find.text('Отчёт.pdf'), findsOneWidget);
    });

    testWidgets('камера: снимок уходит как фото', (tester) async {
      final chat = FakeChat();
      final picker = FakePicker()..cameraNow = file('snap.jpg');
      await open(tester, chat, picker);
      await choose(tester, 'Снять фото');
      expect(chat.uploads, ['snap.jpg']);
    });

    testWidgets('человек сам отменил выбор (не мгновенно) — ничего не происходит и ошибок нет', (tester) async {
      final chat = FakeChat();
      await open(tester, chat, FakePicker(), instantClose: Duration.zero);
      await choose(tester, 'Видео');
      await choose(tester, 'Фото из галереи');
      await choose(tester, 'Файл');
      expect(chat.uploads, isEmpty);
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('окно выбора закрылось мгновенно и пусто: подсказка, а по кнопке — выбор через «Файлы», он запоминается', (tester) async {
      final chat = FakeChat();
      final picker = FakePicker()..viaFilesNow = [file('снимок.jpg')];
      await open(tester, chat, picker);
      await choose(tester, 'Фото из галереи');
      expect(find.textContaining('закрылось, ничего не выбрав'), findsOneWidget);
      expect(chat.uploads, isEmpty);
      await tester.tap(find.text('Выбрать'));
      await tester.pumpAndSettle();
      expect(picker.calls, ['photos', 'viaFiles:image']);
      expect(chat.uploads, ['снимок.jpg']);
      expect(picker.preferred, isTrue, reason: 'в следующий раз «Файлы» откроются сразу');
    });

    testWidgets('«Файл» и «Снять фото» без выбора подсказку про «Файлы» не показывают', (tester) async {
      await open(tester, FakeChat(), FakePicker());
      await choose(tester, 'Файл');
      await choose(tester, 'Снять фото');
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('нет доступа к галерее или камере — понятное сообщение, а не тишина', (tester) async {
      final picker = FakePicker()..error = const PickerException('Нет доступа к камере. Разрешите его в настройках телефона.');
      await open(tester, FakeChat(), picker);
      await choose(tester, 'Снять фото');
      expect(find.text('Нет доступа к камере. Разрешите его в настройках телефона.'), findsOneWidget);
    });

    testWidgets('сервер отказал: причина показана, остальные файлы ушли', (tester) async {
      final chat = FakeChat()..failUpload['huge.mp4'] = 'Видео не больше 1GB';
      final picker = FakePicker()..filesNow = [file('ok.pdf'), file('huge.mp4')];
      await open(tester, chat, picker);
      await choose(tester, 'Файл');
      expect(find.text('Не удалось отправить «huge.mp4»: Видео не больше 1GB'), findsOneWidget);
      expect(chat.all.map((m) => m.payload['name']), ['ok.pdf']);
    });

    testWidgets('пока файл грузится — полоса прогресса с названием; потом исчезает', (tester) async {
      final chat = FakeChat()..uploadGate = Completer<void>();
      final picker = FakePicker()..filesNow = [file('большое.mp4')];
      await open(tester, chat, picker);
      await tester.tap(find.byTooltip('Прикрепить'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Файл'));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('Отправка · большое.mp4'), findsOneWidget);
      expect(find.text('50%'), findsOneWidget);
      chat.uploadGate!.complete();
      await tester.pumpAndSettle();
      expect(find.textContaining('Отправка ·'), findsNothing);
    });

    testWidgets('нет права на медиа — скрепки нет', (tester) async {
      final chat = FakeChat()..metaNow = ChatMeta.fromJson({'type': 'group', 'my_effective_permissions': {'can_send_messages': true, 'can_send_media': false}});
      await open(tester, chat, FakePicker());
      expect(find.byTooltip('Прикрепить'), findsNothing);
    });

    testWidgets('вёрстка меню и полосы прогресса на 320 px при шрифте 200%', (tester) async {
      final chat = FakeChat()..uploadGate = Completer<void>();
      final picker = FakePicker()..filesNow = [file('Очень длинное название файла с описанием отчёта за год.pdf')];
      await open(tester, chat, picker, width: 320, scale: 2);
      await tester.tap(find.byTooltip('Прикрепить'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Файл'));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.takeException(), isNull);
      chat.uploadGate!.complete();
      await tester.pumpAndSettle();
    });
  });
}

/// Выбор файла, который «висит», пока тест не отпустит: имитирует открытое системное окно.
class _SlowPicker extends FakePicker {
  _SlowPicker(this.inner, this.opened, this.release);
  final FakePicker inner;
  final Completer<void> opened;
  final Completer<void> release;

  @override
  Future<List<PickedAttachment>> files() async {
    opened.complete();
    await release.future;
    return inner.files();
  }
}
