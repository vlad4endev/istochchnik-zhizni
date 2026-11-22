import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/push_check.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/profile/push_check_sheet.dart';

class _Env implements PushCheckEnv {
  bool? allowed = true;
  String? appId = '1a2b3c4d';
  List<Map<String, dynamic>> channelList = [
    {'id': 'messages_v2', 'name': 'Сообщения', 'importance': 4, 'hasSound': true, 'lockscreenPublic': true},
  ];
  Object? tokenError;
  String? uploadError;
  Object? statusError;
  Map<String, dynamic> status = {'fcmConfigured': true, 'nativeDevices': 1};
  Object? testError;
  Map<String, dynamic> test = {
    'summary': {'fcm': {'attempted': 1, 'sent': 1, 'failed': 0}}
  };
  final calls = <String>[];

  @override
  Future<bool?> notificationsAllowed() async => allowed;

  @override
  Future<String?> firebaseAppId() async => appId;

  ({bool installations, bool mtalk}) google = (installations: true, mtalk: true);

  @override
  Future<({bool installations, bool mtalk})> googleReachable() async => google;

  @override
  Future<List<Map<String, dynamic>>> channels() async => channelList;

  @override
  Future<String> token() async {
    calls.add('token');
    if (tokenError != null) throw tokenError!;
    return 'x' * 152;
  }

  @override
  Future<String?> uploadToken(String token) async {
    calls.add('upload');
    return uploadError;
  }

  @override
  Future<Map<String, dynamic>> serverStatus() async {
    calls.add('status');
    if (statusError != null) throw statusError!;
    return status;
  }

  @override
  Future<Map<String, dynamic>> sendTest() async {
    calls.add('test');
    if (testError != null) throw testError!;
    return test;
  }
}

void main() {
  group('расшифровка', () {
    test('коды ошибок FCM по-русски', () {
      expect(explainFcmError('messaging/registration-token-not-registered'), contains('войдите снова'));
      expect(explainFcmError('messaging/mismatched-credential'), contains('проект'));
      expect(explainFcmError('messaging/invalid-argument'), contains('некорректный'));
      expect(explainFcmError('messaging/unavailable'), contains('временно'));
      expect(explainFcmError('что-то новое'), 'что-то новое');
    });

    test('итог теста: нет токена, успех, частичный отказ', () {
      expect(interpretTest({'summary': {'fcm': {'attempted': 0}}}).ok, isFalse);
      expect(interpretTest({'summary': {'fcm': {'attempted': 0}}}).detail, contains('нет токена'));
      final ok = interpretTest({'summary': {'fcm': {'attempted': 1, 'sent': 1, 'failed': 0}}});
      expect(ok.ok, isTrue);
      expect(ok.hint, contains('батареи'));
      final bad = interpretTest({'summary': {'fcm': {'attempted': 1, 'sent': 0, 'failed': 1, 'errors': ['messaging/registration-token-not-registered']}}});
      expect(bad.ok, isFalse);
      expect(bad.detail, contains('не доставлено: 1'));
      expect(bad.detail, contains('войдите снова'));
    });

    test('причина сбоя запроса', () {
      final res = Response<Object?>(requestOptions: RequestOptions(path: '/x'), statusCode: 401, data: {'error': 'Unauthorized'});
      expect(describeRequestError(DioException(requestOptions: res.requestOptions, response: res)), 'сервер ответил 401: Unauthorized');
      expect(describeRequestError(DioException(requestOptions: RequestOptions(path: '/x'), type: DioExceptionType.connectionTimeout)), contains('нет связи'));
    });
  });

  group('каналы уведомлений', () {
    test('нормальные каналы — зелёный шаг', () {
      final step = describeChannels([
        {'name': 'Сообщения', 'importance': 4, 'hasSound': true, 'lockscreenPublic': true},
        {'name': 'Уведомления церкви', 'importance': 5, 'hasSound': true, 'lockscreenPublic': true},
      ]);
      expect(step.ok, isTrue);
    });

    test('тихий канал: причина названа, подсказка про настройки', () {
      final step = describeChannels([
        {'name': 'Сообщения', 'importance': 2, 'hasSound': false, 'lockscreenPublic': false},
      ]);
      expect(step.ok, isFalse);
      expect(step.detail, contains('важность низкая'));
      expect(step.detail, contains('звук выключен'));
      expect(step.detail, contains('экране блокировки'));
      expect(step.hint, contains('Важность'));
    });

    test('старый Android без каналов — не ошибка', () {
      expect(describeChannels(const []).ok, isTrue);
    });

    test('в цепочке тихий канал виден, но проверка идёт дальше', () async {
      final env = _Env()..channelList = [{'id': 'messages_v2', 'name': 'Сообщения', 'importance': 2, 'hasSound': true, 'lockscreenPublic': true}];
      final steps = await runPushCheck(env);
      expect(steps.where((s) => !s.ok).map((s) => s.title), ['Каналы уведомлений']);
      expect(steps.length, 8);
    });
  });

  group('связь с Google и ошибки токена', () {
    test('ошибка из скриншота «FCM Registration failed» → подсказка про сеть и Google Play Сервисы', () {
      final hint = explainTokenError('[firebase_messaging/unknown] java.io.IOException: FCM Registration failed!');
      expect(hint, contains('мобильную сеть'));
      expect(hint, contains('Google Play Сервисы'));
      expect(explainTokenError('AUTHENTICATION_FAILED'), contains('ключ'));
      expect(explainTokenError('что-то'), contains('интернет'));
    });

    test('сеть блокирует Google — красный шаг с причиной', () {
      expect(describeGoogle((installations: true, mtalk: true)).ok, isTrue);
      final a = describeGoogle((installations: false, mtalk: true));
      expect(a.ok, isFalse);
      expect(a.detail, contains('firebaseinstallations'));
      final b = describeGoogle((installations: true, mtalk: false));
      expect(b.detail, contains('5228'));
      expect(b.hint, contains('VPN'));
    });

    test('в цепочке недоступный Google виден до шага токена, проверка идёт дальше', () async {
      final env = _Env()..google = (installations: false, mtalk: false);
      final steps = await runPushCheck(env);
      expect(steps.where((s) => !s.ok).map((s) => s.title), ['Связь с Google']);
      expect(steps.length, 8);
    });

    test('токен не выдан при недоступном Google: оба красных шага объясняют сеть', () async {
      final env = _Env()
        ..google = (installations: false, mtalk: true)
        ..tokenError = StateError('java.io.IOException: FCM Registration failed!');
      final steps = await runPushCheck(env);
      expect(steps.last.title, 'Токен устройства');
      expect(steps.last.hint, contains('мобильную сеть'));
      expect(steps.where((s) => !s.ok).length, 2);
    });
  });

  group('проверка цепочки', () {
    test('всё хорошо: восемь шагов, все зелёные', () async {
      final steps = await runPushCheck(_Env());
      expect(steps.length, 8);
      expect(steps.every((s) => s.ok), isTrue);
    });

    test('уведомления выключены в системе — красный первый шаг, но проверка идёт дальше', () async {
      final steps = await runPushCheck(_Env()..allowed = false);
      expect(steps.first.ok, isFalse);
      expect(steps.first.hint, contains('включите'));
      expect(steps.length, 8);
    });

    test('Firebase не запустился — остановка с подсказкой про Google Play Services', () async {
      final env = _Env()..appId = null;
      final steps = await runPushCheck(env);
      expect(steps.last.ok, isFalse);
      expect(steps.last.hint, contains('Google Play'));
      expect(env.calls, isEmpty);
    });

    test('токен не выдан — остановка, текст ошибки виден', () async {
      final env = _Env()..tokenError = StateError('SERVICE_NOT_AVAILABLE');
      final steps = await runPushCheck(env);
      expect(steps.last.title, 'Токен устройства');
      expect(steps.last.ok, isFalse);
      expect(steps.last.detail, contains('SERVICE_NOT_AVAILABLE'));
      expect(env.calls, ['token']);
    });

    test('сервер не принял токен — дальше не идём', () async {
      final env = _Env()..uploadError = 'сервер ответил 401';
      final steps = await runPushCheck(env);
      expect(steps.last.title, 'Сервер принял токен');
      expect(steps.last.detail, contains('401'));
      expect(env.calls, ['token', 'upload']);
    });

    test('на сервере не настроен Firebase — понятная подсказка администратору', () async {
      final env = _Env()..status = {'fcmConfigured': false, 'nativeDevices': 0};
      final steps = await runPushCheck(env);
      expect(steps.last.ok, isFalse);
      expect(steps.last.hint, contains('администратору'));
      expect(env.calls, isNot(contains('test')));
    });

    test('тест отправки провалился — причина с сервера', () async {
      final env = _Env()
        ..test = {'summary': {'fcm': {'attempted': 1, 'sent': 0, 'failed': 1, 'errors': ['messaging/mismatched-credential']}}};
      final steps = await runPushCheck(env);
      expect(steps.last.title, 'Тестовое уведомление');
      expect(steps.last.ok, isFalse);
      expect(steps.last.detail, contains('проект'));
    });

    test('частые нажатия сервера (429) — читаемая причина', () async {
      final res = Response<Object?>(requestOptions: RequestOptions(path: '/t'), statusCode: 429, data: {'error': 'Подождите несколько секунд'});
      final env = _Env()..testError = DioException(requestOptions: res.requestOptions, response: res);
      final steps = await runPushCheck(env);
      expect(steps.last.detail, contains('429'));
      expect(steps.last.detail, contains('Подождите'));
    });
  });

  group('экран проверки', () {
    Future<void> pump(WidgetTester tester, _Env env, {double scale = 1, double width = 360}) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 900), textScaler: TextScaler.linear(scale)), child: Scaffold(body: SingleChildScrollView(child: PushCheckView(env: env)))),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('успех: все шаги и спокойный итог', (tester) async {
      await pump(tester, _Env());
      expect(find.text('Тестовое уведомление'), findsOneWidget);
      expect(find.textContaining('Всё настроено верно'), findsOneWidget);
      expect(find.byKey(const ValueKey('check-again')), findsOneWidget);
    });

    testWidgets('сбой: красный итог, подсказка, «Проверить ещё раз» запускает заново', (tester) async {
      final env = _Env()..uploadError = 'сервер ответил 500';
      await pump(tester, env);
      expect(find.textContaining('Не прошло шагов: 1'), findsOneWidget);
      expect(find.textContaining('сервер ответил 500'), findsOneWidget);
      env.uploadError = null;
      await tester.tap(find.byKey(const ValueKey('check-again')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Всё настроено верно'), findsOneWidget);
    });

    testWidgets('тихий канал: кнопка открывает настройки канала', (tester) async {
      var opened = 0;
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final env = _Env()..channelList = [{'id': 'messages_v2', 'name': 'Сообщения', 'importance': 2, 'hasSound': false, 'lockscreenPublic': true}];
      await tester.pumpWidget(MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: Scaffold(body: SingleChildScrollView(child: PushCheckView(env: env, onOpenChannel: () => opened++))),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('check-open-channel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('check-open-channel')));
      expect(opened, 1);
    });

    for (final (w, s) in [(320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('без переполнений: ширина $w, шрифт $s', (tester) async {
        await pump(tester, _Env()..tokenError = StateError('очень длинное сообщение об ошибке ' * 6), width: w, scale: s);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
