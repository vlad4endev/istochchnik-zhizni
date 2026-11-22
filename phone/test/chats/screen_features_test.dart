import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/drafts.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/logic/chat_logic.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/logic/voice.dart';
import 'package:molitva/features/chats/thread_page.dart';
import 'package:molitva/features/chats/widgets/composer.dart';
import 'package:molitva/features/chats/widgets/media_gallery.dart';
import 'package:molitva/features/chats/widgets/scroll_down_button.dart';
import 'package:molitva/features/chats/widgets/voice_player.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_chat.dart';

class _Mic implements VoiceBackend {
  final calls = <String>[];
  final levels = StreamController<double>.broadcast();
  @override
  Future<bool> hasPermission() async => true;
  @override
  Future<void> start() async => calls.add('start');
  @override
  Future<String?> stop() async {
    calls.add('stop');
    return '/tmp/v.m4a';
  }

  @override
  Future<void> cancel() async => calls.add('cancel');
  @override
  Stream<double> get amplitude => levels.stream;
  @override
  void dispose() {}
}

class _Audio implements VoiceAudio {
  final calls = <String>[];
  final pos = StreamController<Duration>.broadcast();
  final playingNow = StreamController<bool>.broadcast();
  final done = StreamController<void>.broadcast();
  Duration? total = const Duration(seconds: 20);
  bool failLoad = false;

  @override
  Future<Duration?> load(String url) async {
    calls.add('load');
    if (failLoad) throw StateError('404');
    return total;
  }

  @override
  Future<void> play() async {
    calls.add('play');
    playingNow.add(true);
  }

  @override
  Future<void> pause() async {
    calls.add('pause');
    playingNow.add(false);
  }

  @override
  Future<void> seek(Duration to) async => calls.add('seek:${to.inSeconds}');
  @override
  Future<void> setSpeed(double speed) async => calls.add('speed:$speed');
  @override
  Stream<Duration> get position => pos.stream;
  @override
  Stream<bool> get playing => playingNow.stream;
  @override
  Stream<void> get completed => done.stream;
  @override
  void dispose() {}
}

SessionController _session() {
  final s = SessionController();
  s.user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

Widget _host(Widget home, {SessionController? session, double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: session ?? _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    // Черновики общие на приложение — между тестами их нужно сбрасывать.
    await DraftStore.instance.forget();
  });

  Future<void> open(
    WidgetTester tester,
    FakeChat chat, {
    int unread = 0,
    VoiceBackend? mic,
    Stream<Map<String, dynamic>>? events,
    double width = 360,
    double scale = 1,
    SessionController? session,
  }) async {
    tester.view.physicalSize = Size(width, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_host(
      ThreadPage(key: UniqueKey(), conversationId: 'c1', title: 'Молодёжь', type: 'group', source: chat, events: events ?? const Stream.empty(), unreadCount: unread, voiceBackend: mic),
      session: session,
      width: width,
      scale: scale,
    ));
    await tester.pumpAndSettle();
  }

  List<ChatMessage> history(int n) => [for (var i = 1; i <= n; i++) msg('$i', sender: i.isEven ? 2 : 9, name: i.isEven ? 'Анна Орлова' : 'Мария Лис', text: 'Сообщение $i')];

  group('кнопка «вниз» и «Новые сообщения»', () {
    testWidgets('прокрутили вверх — кнопка появилась; тап возвращает вниз; снизу кнопки нет', (tester) async {
      final chat = FakeChat()..all = history(60);
      await open(tester, chat);
      ScrollDownButton button() => tester.widget<ScrollDownButton>(find.byType(ScrollDownButton));
      expect(button().visible, isFalse);
      await tester.drag(find.byType(ListView).first, const Offset(0, 900));
      await tester.pumpAndSettle();
      expect(button().visible, isTrue);
      await tester.tap(find.byKey(const ValueKey('scroll-down')));
      await tester.pumpAndSettle();
      expect(button().visible, isFalse);
    });

    testWidgets('пока смотрите историю, приходят новые — на кнопке счётчик; после возврата он исчезает', (tester) async {
      final chat = FakeChat()..all = history(60);
      final events = StreamController<Map<String, dynamic>>.broadcast();
      addTearDown(events.close);
      await open(tester, chat, events: events.stream);
      await tester.drag(find.byType(ListView).first, const Offset(0, 900));
      await tester.pumpAndSettle();
      chat.all = [...chat.all, msg('61', sender: 2, text: 'Новое 1'), msg('62', sender: 2, text: 'Новое 2')];
      events.add({'type': 'msg:new', 'conversationId': 'c1'});
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(tester.widget<ScrollDownButton>(find.byType(ScrollDownButton)).count, 2);
      expect(find.byKey(const ValueKey('scroll-down-count')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('scroll-down')));
      await tester.pumpAndSettle();
      expect(tester.widget<ScrollDownButton>(find.byType(ScrollDownButton)).count, 0);
    });

    testWidgets('свои новые сообщения счётчик не увеличивают', (tester) async {
      final chat = FakeChat()..all = history(60);
      final events = StreamController<Map<String, dynamic>>.broadcast();
      addTearDown(events.close);
      await open(tester, chat, events: events.stream);
      await tester.drag(find.byType(ListView).first, const Offset(0, 900));
      await tester.pumpAndSettle();
      chat.all = [...chat.all, msg('61', sender: 9, text: 'Я с другого устройства')];
      events.add({'type': 'msg:new', 'conversationId': 'c1'});
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(tester.widget<ScrollDownButton>(find.byType(ScrollDownButton)).count, 0);
    });

    testWidgets('открыли чат с непрочитанными — перед первым из них «Новые сообщения»', (tester) async {
      final chat = FakeChat()..all = [msg('1', sender: 9, text: 'Моё'), msg('2', sender: 2, text: 'Старое'), msg('3', sender: 2, text: 'Новое А'), msg('4', sender: 2, text: 'Новое Б')];
      await open(tester, chat, unread: 2);
      expect(find.byKey(const ValueKey('new-messages-divider')), findsOneWidget);
      expect(find.text('Новое А'), findsOneWidget);
    });

    testWidgets('всё прочитано — полосы нет', (tester) async {
      final chat = FakeChat()..all = history(5);
      await open(tester, chat);
      expect(find.byKey(const ValueKey('new-messages-divider')), findsNothing);
    });
  });

  group('выбор нескольких сообщений', () {
    final clipboard = <String>[];

    setUp(() {
      clipboard.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') clipboard.add((call.arguments as Map)['text'] as String);
        return null;
      });
    });
    tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    Future<void> startSelect(WidgetTester tester, String text) async {
      await tester.tap(find.text(text));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Выбрать'));
      await tester.pumpAndSettle();
    }

    testWidgets('«Выбрать» в меню → «Выбрано: 1»; тап по другим добавляет и снимает; крестик выходит', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat);
      await startSelect(tester, 'Сообщение 4');
      expect(find.text('Выбрано: 1'), findsOneWidget);
      expect(find.byKey(const ValueKey('selected-4')), findsOneWidget);
      expect(find.byKey(const ValueKey('unselected-3')), findsOneWidget);
      await tester.tap(find.text('Сообщение 3'));
      await tester.pumpAndSettle();
      expect(find.text('Выбрано: 2'), findsOneWidget);
      await tester.tap(find.text('Сообщение 3'));
      await tester.pumpAndSettle();
      expect(find.text('Выбрано: 1'), findsOneWidget);
      await tester.tap(find.byTooltip('Отменить выбор'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Выбрано'), findsNothing);
      expect(find.byType(ChatComposer), findsOneWidget, reason: 'поле ввода вернулось');
    });

    testWidgets('копирование нескольких: в порядке переписки, с именами авторов', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat);
      await startSelect(tester, 'Сообщение 4');
      await tester.tap(find.text('Сообщение 3'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Копировать'));
      await tester.pumpAndSettle();
      expect(clipboard.single, 'Мария Лис: Сообщение 3\nАнна Орлова: Сообщение 4');
      expect(find.textContaining('Выбрано'), findsNothing, reason: 'после копирования выбор снят');
    });

    testWidgets('удаление: подтверждение, потом удаляются все выбранные; «Отмена» ничего не трогает', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat);
      await startSelect(tester, 'Сообщение 3'); // моё (нечётное)
      await tester.tap(find.text('Сообщение 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Удалить'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить 2 сообщения?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('selection-delete-cancel')));
      await tester.pumpAndSettle();
      expect(chat.calls.where((c) => c.startsWith('delete')), isEmpty);
      await tester.tap(find.byTooltip('Удалить'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('selection-delete-ok')));
      await tester.pumpAndSettle();
      expect(chat.calls.where((c) => c.startsWith('delete')), ['delete:1', 'delete:3']);
    });

    testWidgets('среди выбранных чужое — кнопки «Удалить» нет (как в Telegram)', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat);
      await startSelect(tester, 'Сообщение 3');
      expect(find.byTooltip('Удалить'), findsOneWidget);
      await tester.tap(find.text('Сообщение 4')); // чужое
      await tester.pumpAndSettle();
      expect(find.byTooltip('Удалить'), findsNothing);
      expect(find.byTooltip('Переслать'), findsOneWidget);
    });

    testWidgets('кнопка «назад» сначала снимает выбор, а не закрывает чат', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat);
      await startSelect(tester, 'Сообщение 4');
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.textContaining('Выбрано'), findsNothing);
      expect(find.byType(ThreadPage), findsOneWidget);
    });

    testWidgets('вёрстка на 320 px и шрифте 2.0 без переполнений', (tester) async {
      final chat = FakeChat()..all = history(4);
      await open(tester, chat, width: 320, scale: 2);
      await startSelect(tester, 'Сообщение 4');
      expect(tester.takeException(), isNull);
    });
  });

  group('упоминания', () {
    testWidgets('«@Ан» в группе → подсказки; тап вставляет имя; на сервер уходит @[id]', (tester) async {
      final chat = FakeChat()..all = history(2);
      await open(tester, chat);
      final field = find.byType(TextField).last;
      await tester.enterText(field, 'Привет @Ан');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('mention-suggestions')), findsOneWidget);
      expect(find.byKey(const ValueKey('mention-2')), findsOneWidget, reason: 'Анна Орлова');
      expect(find.byKey(const ValueKey('mention-9')), findsNothing, reason: 'себя упоминать не предлагаем');
      await tester.tap(find.byKey(const ValueKey('mention-2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('mention-suggestions')), findsNothing);
      await tester.tap(find.byTooltip('Отправить'));
      await tester.pumpAndSettle();
      expect(chat.calls.where((c) => c.startsWith('send:')).single, 'send:Привет @[2]::text', reason: 'на сервер уходит @[id], а не имя');
    });

    testWidgets('в сообщении @[id] показывается именем участника', (tester) async {
      final chat = FakeChat()..all = [msg('1', sender: 9, name: 'Мария Лис', text: 'Позовите @[2], пожалуйста')];
      await open(tester, chat);
      expect(find.textContaining('Позовите @Анна Орлова, пожалуйста', findRichText: true), findsOneWidget);
    });

    testWidgets('в личном чате подсказок нет', (tester) async {
      tester.view.physicalSize = const Size(360, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final chat = FakeChat()
        ..metaNow = const ChatMeta(type: 'private', title: '')
        ..all = history(2);
      await tester.pumpWidget(_host(ThreadPage(key: UniqueKey(), conversationId: 'c1', title: 'Анна', type: 'private', otherMemberId: 2, source: chat, events: const Stream.empty())));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, '@Ан');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('mention-suggestions')), findsNothing);
    });
  });

  group('запись голосового', () {
    Future<TestGesture> hold(WidgetTester tester) async {
      final gesture = await tester.startGesture(tester.getCenter(find.byKey(const ValueKey('mic'))));
      await tester.pump(const Duration(milliseconds: 700));
      return gesture;
    }

    testWidgets('удержание → полоса записи с таймером; отпустили — голосовое отправлено с длительностью и волной', (tester) async {
      final chat = FakeChat()..all = history(2);
      final mic = _Mic();
      await open(tester, chat, mic: mic);
      final gesture = await hold(tester);
      expect(find.byKey(const ValueKey('recording-bar')), findsOneWidget);
      expect(find.text('0:00'), findsWidgets);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 900)));
      await tester.pump(const Duration(milliseconds: 200));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('recording-bar')), findsNothing);
      expect(mic.calls, ['start', 'stop']);
      expect(chat.uploads, ['voice.m4a']);
      expect(chat.calls.where((c) => c.startsWith('send:')).single, endsWith(':audio'));
    });

    testWidgets('свайп влево и отпустить — запись удаляется, ничего не отправляется', (tester) async {
      final chat = FakeChat()..all = history(2);
      final mic = _Mic();
      await open(tester, chat, mic: mic);
      final gesture = await hold(tester);
      await gesture.moveBy(const Offset(-150, 0));
      await tester.pump();
      expect(find.textContaining('запись удалится'), findsOneWidget);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(mic.calls, ['start', 'cancel']);
      expect(chat.uploads, isEmpty);
    });

    testWidgets('свайп вверх — запись закреплена: кнопки «Удалить» и «Отправить запись»', (tester) async {
      final chat = FakeChat()..all = history(2);
      final mic = _Mic();
      await open(tester, chat, mic: mic);
      final gesture = await hold(tester);
      await gesture.moveBy(const Offset(0, -110));
      await tester.pump();
      await gesture.up();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('recording-cancel')), findsOneWidget);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 900)));
      await tester.tap(find.byTooltip('Отправить запись'));
      await tester.pumpAndSettle();
      expect(chat.uploads, ['voice.m4a']);
    });

    testWidgets('короткое касание микрофона — подсказка «Удерживайте кнопку», запись не начинается', (tester) async {
      final chat = FakeChat()..all = history(2);
      final mic = _Mic();
      await open(tester, chat, mic: mic);
      await tester.tap(find.byKey(const ValueKey('mic')));
      await tester.pump();
      expect(find.textContaining('Удерживайте кнопку'), findsOneWidget);
      expect(mic.calls, isEmpty);
    });

    testWidgets('слишком короткая запись не отправляется и объясняется', (tester) async {
      final chat = FakeChat()..all = history(2);
      final mic = _Mic();
      await open(tester, chat, mic: mic);
      final gesture = await hold(tester);
      await gesture.up(); // реального времени прошло ~0 мс — меньше минимума
      await tester.pumpAndSettle();
      expect(chat.uploads, isEmpty);
      expect(find.textContaining('Удерживайте'), findsOneWidget);
    });

    testWidgets('с текстом в поле вместо микрофона — «Отправить»', (tester) async {
      final chat = FakeChat()..all = history(2);
      await open(tester, chat, mic: _Mic());
      await tester.enterText(find.byType(TextField).last, 'текст');
      await tester.pump();
      expect(find.byKey(const ValueKey('mic')), findsNothing);
      expect(find.byTooltip('Отправить'), findsOneWidget);
    });

    testWidgets('вёрстка записи на 320 px и шрифте 2.0', (tester) async {
      final chat = FakeChat()..all = history(2);
      await open(tester, chat, mic: _Mic(), width: 320, scale: 2);
      final gesture = await hold(tester);
      expect(tester.takeException(), isNull);
      await gesture.moveBy(const Offset(-150, 0));
      await gesture.up();
      await tester.pumpAndSettle();
    });
  });

  group('воспроизведение голосового', () {
    late _Audio audio;
    setUp(() {
      audio = _Audio();
      VoicePlayback.factory = () => audio;
    });

    Widget player({String id = 'v1', Duration? hint = const Duration(seconds: 20)}) => _host(Scaffold(
          body: Center(child: VoiceMessagePlayer(id: id, url: 'https://x/v.m4a', waveform: List.filled(40, 50), durationHint: hint, color: Colors.purple, mutedColor: Colors.grey)),
        ));

    testWidgets('до запуска видна длительность; ▶ запускает, ⏸ ставит на паузу', (tester) async {
      await tester.pumpWidget(player());
      expect(find.text('0:20'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      expect(audio.calls, containsAllInOrder(['load', 'speed:1.0', 'play']));
      expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      expect(audio.calls.last, 'pause');
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    });

    testWidgets('идёт воспроизведение — показывается сколько осталось', (tester) async {
      await tester.pumpWidget(player());
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      audio.pos.add(const Duration(seconds: 5));
      await tester.pump();
      await tester.pump();
      expect(find.text('0:15'), findsOneWidget);
    });

    testWidgets('скорость 1× → 1,5× → 2× → 1× и она передаётся плееру', (tester) async {
      await tester.pumpWidget(player());
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      for (final expected in ['1,5×', '2×', '1×']) {
        await tester.tap(find.byKey(const ValueKey('voice-speed')));
        await tester.pump();
        expect(find.text(expected), findsOneWidget);
      }
      expect(audio.calls.where((c) => c.startsWith('speed:')), ['speed:1.0', 'speed:1.5', 'speed:2.0', 'speed:1.0']);
    });

    testWidgets('тап по волне перематывает пропорционально', (tester) async {
      await tester.pumpWidget(player());
      final box = tester.getRect(find.byKey(const ValueKey('voice-wave')));
      await tester.tapAt(Offset(box.left + box.width / 2, box.center.dy));
      await tester.pumpAndSettle();
      expect(audio.calls.any((c) => c == 'seek:10'), isTrue, reason: 'середина волны — 10 секунд из 20');
    });

    testWidgets('дослушали до конца — возврат в начало, снова можно нажать ▶', (tester) async {
      await tester.pumpWidget(player());
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      audio.pos.add(const Duration(seconds: 20));
      audio.done.add(null);
      await tester.pumpAndSettle();
      expect(audio.calls, containsAllInOrder(['pause', 'seek:0']));
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
      expect(find.text('0:20'), findsOneWidget);
    });

    testWidgets('включили второе голосовое — первое замолкает', (tester) async {
      final a = _Audio();
      final b = _Audio();
      final queue = [a, b];
      VoicePlayback.factory = () => queue.removeAt(0);
      await tester.pumpWidget(_host(Scaffold(
        body: Column(children: [
          VoiceMessagePlayer(id: 'one', url: 'u1', waveform: List.filled(40, 50), durationHint: const Duration(seconds: 5), color: Colors.purple, mutedColor: Colors.grey),
          VoiceMessagePlayer(id: 'two', url: 'u2', waveform: List.filled(40, 50), durationHint: const Duration(seconds: 5), color: Colors.purple, mutedColor: Colors.grey),
        ]),
      )));
      await tester.tap(find.byKey(const ValueKey('voice-toggle')).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('voice-toggle')).last);
      await tester.pumpAndSettle();
      expect(a.calls, contains('pause'));
      expect(b.calls, contains('play'));
    });

    testWidgets('запись не загрузилась — понятный текст, плеер не ломается', (tester) async {
      audio.failLoad = true;
      await tester.pumpWidget(player());
      await tester.tap(find.byKey(const ValueKey('voice-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Не удалось включить запись'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('запись из веба (без волны и длительности) показывается ровной волной', (tester) async {
      await tester.pumpWidget(player(hint: null));
      expect(find.text('0:00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('галерея «Медиа, файлы, ссылки»', () {
    SharedMedia media() => SharedMedia(
          images: const [(messageId: '5', url: 'https://x/a.jpg'), (messageId: '3', url: 'https://x/b.jpg')],
          videos: const [(messageId: '4', url: 'https://x/c.mp4')],
          files: [SharedFile(messageId: '2', url: 'https://x/d.pdf', name: 'Отчёт.pdf', size: 1258291, at: DateTime.now())],
          links: const [SharedLink(messageId: '1', url: 'https://www.example.com/page')],
        );

    testWidgets('вкладки со счётчиками и переключение: файлы с размером, ссылки с доменом', (tester) async {
      final opened = <String>[];
      await tester.pumpWidget(_host(MediaGalleryPage(media: media(), onOpenUrl: opened.add)));
      expect(find.text('Фото и видео · 3'), findsOneWidget);
      expect(find.text('Файлы · 1'), findsOneWidget);
      expect(find.text('Ссылки · 1'), findsOneWidget);
      expect(find.byKey(const ValueKey('gallery-grid')), findsOneWidget);
      await tester.tap(find.text('Файлы · 1'));
      await tester.pumpAndSettle();
      expect(find.text('Отчёт.pdf'), findsOneWidget);
      expect(find.textContaining('1,2 МБ'), findsOneWidget);
      await tester.tap(find.text('Отчёт.pdf'));
      expect(opened, ['https://x/d.pdf']);
      await tester.tap(find.text('Ссылки · 1'));
      await tester.pumpAndSettle();
      expect(find.text('example.com'), findsOneWidget);
      await tester.tap(find.text('example.com'));
      expect(opened.last, 'https://www.example.com/page');
    });

    testWidgets('пустые вкладки — понятные подписи', (tester) async {
      await tester.pumpWidget(_host(MediaGalleryPage(media: const SharedMedia(), onOpenUrl: (_) {})));
      expect(find.text('Фото и видео пока нет'), findsOneWidget);
      await tester.tap(find.text('Файлы · 0'));
      await tester.pumpAndSettle();
      expect(find.text('Файлов пока нет'), findsOneWidget);
      await tester.tap(find.text('Ссылки · 0'));
      await tester.pumpAndSettle();
      expect(find.text('Ссылок пока нет'), findsOneWidget);
    });

    testWidgets('тап по фото открывает просмотр с листанием и счётчиком «2 из 2»', (tester) async {
      await tester.pumpWidget(_host(MediaGalleryPage(media: media(), onOpenUrl: (_) {})));
      await tester.tap(find.byKey(const ValueKey('gallery-item-5')));
      await tester.pumpAndSettle();
      expect(find.text('1 из 2'), findsOneWidget, reason: 'в просмотр попадают только фото, видео открывается плеером');
      await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
      await tester.pumpAndSettle();
      expect(find.text('2 из 2'), findsOneWidget);
    });

    testWidgets('вёрстка на 320 px и шрифте 2.0; «показаны последние» при неполной истории', (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_host(MediaGalleryPage(media: media(), onOpenUrl: (_) {}, partial: true), width: 320, scale: 2));
      expect(find.text('Показаны последние сообщения чата'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
