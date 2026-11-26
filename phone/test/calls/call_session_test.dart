import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/nav.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/calls/call_controller.dart';
import 'package:molitva/features/calls/call_page.dart';
import 'package:molitva/features/calls/logic/call_access.dart';
import 'package:molitva/features/calls/logic/invite_send.dart';
import 'package:molitva/features/calls/logic/meeting_logic.dart';
import 'package:molitva/features/calls/widgets/call_banner.dart';
import 'package:molitva/features/calls/widgets/call_widgets.dart';
import 'package:molitva/features/chats/models/chat_models.dart' show ChatMessage;
import 'package:molitva/features/chats/widgets/chat_sheets.dart' show ChatPick;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../chats/fake_chat.dart';

class _MemoryStorage extends FlutterSecureStorage {
  _MemoryStorage();
  final values = <String, String>{};

  @override
  Future<String?> read({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async => values[key];

  @override
  Future<void> write({required String key, required String? value, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async => values.remove(key);
}

/// Сервер звонков без сети: запоминает запросы и отвечает «хорошо».
class _Api implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  List<RequestOptions> to(String suffix) => requests.where((r) => r.path.endsWith(suffix)).toList();

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return ResponseBody.fromString('{}', 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

class _NoPermissions implements CallPermissionGate {
  const _NoPermissions();
  @override
  Future<({Access mic, Access cam})> request({required bool camera}) async => (mic: Access.granted, cam: Access.granted);
  @override
  Future<void> openSettings() async {}
}

/// Чаты для «Поделиться»: запоминает, куда что отправили, и может «не дозвониться» до выбранных.
class _Chats extends FakeChat {
  final sent = <(String, String)>[];
  final failFor = <String>{};

  @override
  Future<ChatMessage?> send(String conversationId, String text, {String? replyTo, String payloadType = 'text', Map<String, dynamic>? payload}) async {
    if (failFor.contains(conversationId)) throw StateError('нет сети');
    sent.add((conversationId, text));
    return null;
  }
}

const _meeting = MeetingLaunch(media: MeetingMedia.audio, conversationId: '5', title: 'Молитвенная стража');
const _url = 'https://app.church-tambov.ru/call/join/abcDEF123';

void main() {
  late SessionController session;
  late _Api api;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    session = SessionController(storage: _MemoryStorage());
    api = _Api();
    session.dio.httpClientAdapter = api;
    CallCenter.instance.debugReset();
  });

  tearDown(() => CallCenter.instance.debugReset());

  /// Завершает звонок и отпускает комнату (в её таймеры не должно оставаться «висящих» после теста).
  Future<void> endAll(WidgetTester tester, [CallController? c]) async {
    final call = c ?? CallCenter.instance.current;
    if (call != null && !call.ended) {
      await tester.runAsync(() async {
        await call.hangUp();
        await Future<void>.delayed(const Duration(milliseconds: 30));
      });
    }
    await tester.pump(const Duration(milliseconds: 50));
  }

  CallController joined({String callId = 'c1', CallSpec? spec}) {
    final c = CallController(
      spec: spec ?? const CallSpec(callId: 'c1', meeting: _meeting, title: 'Молитвенная стража'),
      session: session,
      permissions: const _NoPermissions(),
    )..debugJoin(inviteUrlValue: _url);
    CallCenter.instance.claim(c);
    return c;
  }

  /// Каждый тест в конце завершает звонок: у настоящей комнаты есть таймеры, их нельзя оставлять.
  void callTest(String name, Future<void> Function(WidgetTester tester) body) => testWidgets(name, (tester) async {
        try {
          await body(tester);
        } finally {
          await endAll(tester);
        }
      });

  Widget app(Widget home, {double width = 360, double scale = 1}) => ChangeNotifierProvider<SessionController>.value(
        value: session,
        child: MaterialApp(
          navigatorKey: navigatorKey,
          theme: churchTheme(brightness: Brightness.light),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
            child: CallBannerHost(child: child ?? const SizedBox.shrink()),
          ),
          home: home,
        ),
      );

  /// Экран «звонит вам» бесконечно анимируется, поэтому ждём не «пока успокоится», а фиксированное время.
  Future<void> settleRoute(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> size(WidgetTester tester, {double width = 360}) async {
    tester.view.physicalSize = Size(width, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  group('звонок живёт отдельно от экрана', () {
    callTest('«Свернуть» закрывает экран, но звонок идёт: запроса на завершение нет, сверху плашка', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Center(child: Text('Чаты')))));
      expect(find.byKey(const ValueKey('call-banner')), findsOneWidget, reason: 'звонок идёт, а его экран не открыт — плашка есть');

      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      expect(find.text('Выйти'), findsOneWidget);
      expect(find.byKey(const ValueKey('call-banner')), findsNothing, reason: 'пока звонок открыт на экране — плашки нет');

      await tester.tap(find.byKey(const ValueKey('call-minimize')));
      await tester.pumpAndSettle();
      expect(find.text('Чаты'), findsOneWidget, reason: 'вернулись в приложение');
      expect(find.byKey(const ValueKey('call-banner')), findsOneWidget);
      expect(find.textContaining('Аудиовстреча · Молитвенная стража'), findsOneWidget);
      expect(api.to('/end'), isEmpty, reason: 'звонок не завершён');
      expect(c.ended, isFalse);
      expect(c.joined, isTrue);
      expect(CallCenter.instance.current, same(c));
    });

    callTest('системное «Назад» тоже сворачивает, а не завершает', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Главная'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Главная'), findsOneWidget);
      expect(api.to('/end'), isEmpty);
      expect(find.byKey(const ValueKey('call-banner')), findsOneWidget);
    });

    callTest('нажатие на плашку возвращает на тот же звонок; «Выйти из встречи» завершает его и убирает плашку', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('call-minimize')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('call-banner')));
      await tester.pumpAndSettle();
      expect(find.text('Выйти'), findsOneWidget, reason: 'экран звонка открыт снова');
      expect(find.byKey(const ValueKey('call-banner')), findsNothing);
      expect(CallCenter.instance.current, same(c), reason: 'тот же звонок, а не новый');

      await tester.tap(find.byTooltip('Выход из встречи'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Выйти из встречи'));
      await tester.pumpAndSettle();
      expect(api.to('/api/calls/c1/end').single.data, {'endForAll': false});
      expect(c.ended, isTrue);
      expect(CallCenter.instance.current, isNull);
      expect(find.byKey(const ValueKey('call-banner')), findsNothing);
      expect(find.text('Чаты'), findsOneWidget);
    });

    callTest('«Завершить для всех» завершает встречу для всех', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Выход из встречи'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Завершить для всех'));
      await tester.pumpAndSettle();
      expect(api.to('/api/calls/c1/end').single.data, {'endForAll': true});
    });

    callTest('звонок завершили другие, пока экран свёрнут: плашка исчезает и человеку сказано почему', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('call-minimize')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('call-banner')), findsOneWidget);

      session.realtime.debugReceive({'type': 'call:ended', 'callId': 'c1'});
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('call-banner')), findsNothing);
      expect(find.text('Звонок завершён'), findsOneWidget);
      expect(CallCenter.instance.current, isNull);
      expect(c.ended, isTrue);
    });

    callTest('события чужих звонков не трогают этот звонок', (tester) async {
      await size(tester);
      final c = joined();
      session.realtime.debugReceive({'type': 'call:ended', 'callId': 'другой'});
      await tester.pump();
      expect(c.ended, isFalse);
    });

    callTest('плашка не рушит экраны под ней: структура приложения не пересоздаётся, отступ сверху не удваивается', (tester) async {
      await size(tester);
      final c = joined();
      await tester.pumpWidget(app(Scaffold(body: Builder(builder: (context) => Text('top=${MediaQuery.paddingOf(context).top}')))));
      final before = tester.element(find.byType(Scaffold));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('call-minimize')));
      await tester.pumpAndSettle();
      expect(identical(tester.element(find.byType(Scaffold)), before), isTrue, reason: 'Navigator и экран остались теми же');
      expect(find.text('top=0.0'), findsOneWidget);
    });

    callTest('плашка помещается на 320 px при шрифте 200%', (tester) async {
      await size(tester, width: 320);
      final c = joined(spec: const CallSpec(callId: 'c1', meeting: MeetingLaunch(media: MeetingMedia.video, title: 'Очень длинное название встречи для проверки переноса и обрезки текста в плашке')));
      CallCenter.instance.adopt(c);
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты')), width: 320, scale: 2));
      c.markMinimizing();
      await tester.pump();
      expect(find.byKey(const ValueKey('call-banner')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('личный звонок', () {
    callTest('личный звонок тоже сворачивается: плашка «Звонок · имя», ссылки и «Поделиться» у него нет', (tester) async {
      await size(tester);
      final c = CallController(spec: const CallSpec(callId: 'd1', recipientId: 7, title: 'Анна Орлова'), session: session, permissions: const _NoPermissions())..debugJoin();
      CallCenter.instance.claim(c);
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c)));
      await tester.pumpAndSettle();
      expect(find.text('Ссылка'), findsNothing);
      expect(find.text('Поделиться'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('call-minimize')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Звонок · Анна Орлова'), findsOneWidget);
      expect(api.to('/end'), isEmpty);
      await tester.tap(find.byKey(const ValueKey('call-banner')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Выйти'));
      await tester.pumpAndSettle();
      expect(api.to('/api/calls/d1/end').single.data, {'endForAll': true}, reason: 'личный звонок завершается для обоих');
    });
  });

  group('несколько звонков', () {
    callTest('входящий, пока он только звонит, не обрывает идущий разговор; принятый — заменяет', (tester) async {
      await size(tester);
      final first = joined();
      final incoming = CallCenter.instance.begin(
        spec: const CallSpec(callId: 'c2', incoming: true, title: 'Анна'),
        session: session,
        permissions: const _NoPermissions(),
      );
      expect(CallCenter.instance.current, same(first), reason: 'пока звонит — идущий звонок не тронут');
      expect(api.to('/end'), isEmpty);

      CallCenter.instance.claim(incoming);
      await tester.pump();
      expect(CallCenter.instance.current, same(incoming));
      await tester.pump(const Duration(milliseconds: 50));
      expect(api.to('/api/calls/c1/end'), hasLength(1), reason: 'предыдущий звонок завершён');
      expect(first.ended, isTrue);
      incoming.abandon();
    });

    callTest('begin() для уже идущего звонка возвращает его же', (tester) async {
      final first = joined();
      final again = CallCenter.instance.begin(spec: const CallSpec(callId: 'c1', incoming: true, title: 'x'), session: session);
      expect(again, same(first));
    });

    callTest('«Позвонить» при идущем звонке: спрашиваем; «Вернуться» возвращает к звонку, «Завершить и начать» разрешает новый', (tester) async {
      await size(tester);
      final active = joined();
      var returned = 0;
      late BuildContext ctx;
      await tester.pumpWidget(app(Builder(builder: (context) {
        ctx = context;
        return const Scaffold(body: Text('Чаты'));
      })));
      var allowed = <bool>[];
      Future<void> ask() async => allowed.add(await confirmStartNewCall(ctx, onReturn: () => returned++));

      unawaited(ask());
      await tester.pumpAndSettle();
      expect(find.text('Сейчас идёт звонок'), findsOneWidget);
      expect(find.textContaining('Молитвенная стража'), findsWidgets);
      await tester.tap(find.byKey(const ValueKey('call-return')));
      await tester.pumpAndSettle();
      expect(allowed, [false]);
      expect(returned, 1);

      unawaited(ask());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('call-replace')));
      await tester.pumpAndSettle();
      expect(allowed, [false, true]);

      await endAll(tester, active);
      CallCenter.instance.debugReset();
      await ask();
      expect(allowed.last, isTrue, reason: 'звонка нет — спрашивать не о чем');
    });
  });

  group('отмена и сбои подключения', () {
    callTest('закрыли экран «звонит вам», не отвечая: звонок не принят и не завершается за собеседника', (tester) async {
      await size(tester);
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => const CallPage(callId: 'c9', incoming: true, title: 'Анна', permissions: _NoPermissions())));
      await settleRoute(tester);
      expect(find.text('Звонит вам…'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await settleRoute(tester);
      expect(api.to('/accept'), isEmpty);
      expect(api.to('/end'), isEmpty);
      expect(CallCenter.instance.current, isNull);
    });

    callTest('нет доступа к микрофону: понятная ошибка и кнопка настроек, звонок не создаётся', (tester) async {
      await size(tester);
      final denied = _Gate(const (mic: Access.blocked, cam: Access.granted));
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(video: false, title: 'Анна', recipientId: 7, permissions: denied)));
      await settleRoute(tester);
      expect(find.textContaining('Микрофон запрещён'), findsOneWidget);
      expect(find.text('Настройки'), findsOneWidget);
      expect(find.byKey(const ValueKey('call-banner')), findsNothing, reason: 'подключения не было — плашки нет');
      expect(api.to('/api/calls'), isEmpty, reason: 'звонок на сервере не создавался');
      await tester.ensureVisible(find.text('Настройки'));
      await tester.tap(find.text('Настройки'));
      expect(denied.settingsOpened, 1);
      await tester.ensureVisible(find.text('Завершить'));
      await tester.tap(find.text('Завершить'));
      await settleRoute(tester);
      expect(find.text('Чаты'), findsOneWidget);
    });

    callTest('вышли с экрана ошибки — звонок отменён, плашки нет', (tester) async {
      await size(tester);
      final denied = _Gate(const (mic: Access.denied, cam: Access.granted));
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(title: 'Анна', recipientId: 7, permissions: denied)));
      await settleRoute(tester);
      await tester.binding.handlePopRoute();
      await settleRoute(tester);
      expect(CallCenter.instance.current, isNull);
      expect(find.byKey(const ValueKey('call-banner')), findsNothing);
    });
  });

  group('«Поделиться» приглашением', () {
    callTest('в плашке приглашения «Копировать» и «Поделиться» рядом; на 320 px при шрифте 200% помещаются', (tester) async {
      await size(tester, width: 320);
      var copied = 0;
      var shared = 0;
      await tester.pumpWidget(app(
        Scaffold(
          body: InviteBar(title: 'Молитвенная стража', url: _url, copied: false, onCopy: () => copied++, onShare: () => shared++, onClose: () {}),
        ),
        width: 320,
        scale: 2,
      ));
      expect(find.byKey(const ValueKey('invite-copy')), findsOneWidget);
      expect(find.byKey(const ValueKey('invite-share')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('invite-copy')));
      await tester.tap(find.byKey(const ValueKey('invite-share')));
      expect((copied, shared), (1, 1));
      expect(tester.takeException(), isNull);
    });

    callTest('без обработчика «Поделиться» кнопки нет', (tester) async {
      await tester.pumpWidget(app(Scaffold(body: InviteBar(title: 'x', url: _url, copied: false, onCopy: () {}, onClose: () {}))));
      expect(find.byKey(const ValueKey('invite-share')), findsNothing);
    });

    callTest('в списке участников «Поделиться в чатах» закрывает список и запускает отправку', (tester) async {
      await size(tester);
      var shared = 0;
      await tester.pumpWidget(app(Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => showParticipantsSheet(context, people: const [CallPerson(identity: 'l', name: 'Мария', isLocal: true)], inviteUrl: _url, onCopyInvite: () {}, onShareInvite: () => shared++),
            child: const Text('открыть'),
          ),
        ),
      )));
      await tester.tap(find.text('открыть'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('sheet-share')));
      await tester.tap(find.byKey(const ValueKey('sheet-share')));
      await tester.pumpAndSettle();
      expect(shared, 1);
      expect(find.byKey(const ValueKey('sheet-share')), findsNothing, reason: 'список закрылся');
    });

    callTest('весь путь: «Поделиться» → выбор двух чатов → приглашение само уходит в оба, от имени пользователя', (tester) async {
      await size(tester);
      final chats = _Chats()
        ..conversationsNow = [
          {'id': '1', 'type': 'group', 'title': 'Молодёжь'},
          {'id': '2', 'type': 'group', 'title': 'Молитвенная группа'},
          {'id': '3', 'type': 'private', 'other_member': {'name': 'Анна Орлова'}},
        ];
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c, chatSource: chats)));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('invite-share')));
      await tester.pumpAndSettle();
      expect(find.text('Отправить приглашение'), findsOneWidget);
      expect(find.text('Молодёжь'), findsOneWidget);
      await tester.tap(find.text('Молодёжь'));
      await tester.tap(find.text('Анна Орлова'));
      await tester.pump();
      await tester.tap(find.text('Отправить (2)'));
      await tester.pumpAndSettle();

      expect(chats.sent, [
        ('1', 'Молитвенная стража\n$_url'),
        ('3', 'Молитвенная стража\n$_url'),
      ]);
      expect(find.text('Приглашение отправлено в 2 чата'), findsOneWidget);
      expect(find.text('Выйти'), findsOneWidget, reason: 'звонок остался на экране');
      expect(c.ended, isFalse);
    });

    callTest('один чат не принял: остальным ушло, человеку сказано, куда не вышло; звонок цел', (tester) async {
      await size(tester);
      final chats = _Chats()
        ..failFor.add('2')
        ..conversationsNow = [
          {'id': '1', 'type': 'group', 'title': 'Молодёжь'},
          {'id': '2', 'type': 'group', 'title': 'Молитвенная группа'},
        ];
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c, chatSource: chats)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('invite-share')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Молодёжь'));
      await tester.tap(find.text('Молитвенная группа'));
      await tester.pump();
      await tester.tap(find.text('Отправить (2)'));
      await tester.pumpAndSettle();
      expect(chats.sent.map((e) => e.$1), ['1']);
      expect(find.textContaining('Отправлено в 1 из 2'), findsOneWidget);
      expect(find.textContaining('«Молитвенная группа»'), findsOneWidget);
      expect(c.ended, isFalse);
    });

    callTest('кнопка «Поделиться» и в панели управления, не только в плашке приглашения', (tester) async {
      await size(tester);
      final chats = _Chats()..conversationsNow = [{'id': '1', 'type': 'group', 'title': 'Молодёжь'}];
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c, chatSource: chats)));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Скрыть'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('invite-share')), findsNothing, reason: 'плашку приглашения скрыли');
      expect(find.text('Ссылка'), findsOneWidget);
      await tester.tap(find.text('Поделиться'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Молодёжь'));
      await tester.pump();
      await tester.tap(find.text('Отправить (1)'));
      await tester.pumpAndSettle();
      expect(chats.sent.single, ('1', 'Молитвенная стража\n$_url'));
      expect(find.text('Приглашение отправлено в «Молодёжь»'), findsOneWidget);
    });

    callTest('закрыли выбор чатов, ничего не выбрав, — ничего не отправлено', (tester) async {
      await size(tester);
      final chats = _Chats()..conversationsNow = [{'id': '1', 'type': 'group', 'title': 'Молодёжь'}];
      final c = joined();
      await tester.pumpWidget(app(const Scaffold(body: Text('Чаты'))));
      navigatorKey.currentState!.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: c, chatSource: chats)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('invite-share')));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(180, 20));
      await tester.pumpAndSettle();
      expect(chats.sent, isEmpty);
    });

    test('отправка: по очереди, от имени пользователя, сбой одного чата не мешает остальным', () async {
      final chats = _Chats()..failFor.add('b');
      final outcome = await sendInviteToChats(chats, const [ChatPick(id: 'a', title: 'А'), ChatPick(id: 'b', title: 'Б'), ChatPick(id: 'c', title: 'В')], 'Встреча\nhttps://x/call/join/t');
      expect(chats.sent.map((e) => e.$1), ['a', 'c']);
      expect(outcome.sent, ['А', 'В']);
      expect(outcome.failed, ['Б']);
      expect(outcome.allSent, isFalse);
      expect(outcome.noneSent, isFalse);
    });

    test('что говорим человеку по итогу', () {
      String say(List<String> sent, List<String> failed) => describeInviteShare(InviteShareOutcome(sent: sent, failed: failed));
      expect(say(['Молодёжь'], []), 'Приглашение отправлено в «Молодёжь»');
      expect(say(['А', 'Б'], []), 'Приглашение отправлено в 2 чата');
      expect(say(['А', 'Б', 'В', 'Г', 'Д'], []), 'Приглашение отправлено в 5 чатов');
      expect(say(['А'], ['Б', 'В']), 'Отправлено в 1 из 3. Не получилось: «Б», «В» — проверьте интернет.');
      expect(say([], ['Б']), contains('«Б»'));
      expect(say([], ['Б', 'В']), 'Не удалось отправить приглашение — проверьте интернет и попробуйте снова.');
      expect(say([], []), 'Чаты не выбраны');
    });
  });
}

class _Gate implements CallPermissionGate {
  _Gate(this.result);
  final ({Access mic, Access cam}) result;
  int settingsOpened = 0;
  @override
  Future<({Access mic, Access cam})> request({required bool camera}) async => result;
  @override
  Future<void> openSettings() async => settingsOpened++;
}
