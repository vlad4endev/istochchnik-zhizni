import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MemoryStorage extends FlutterSecureStorage {
  _MemoryStorage(this.values);
  final Map<String, String> values;

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

/// Отвечает по сценарию и запоминает все запросы.
class _Server implements HttpClientAdapter {
  _Server(this.handler);
  final ResponseBody Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  /// Пока приложение запускается (профиль, разделы), отвечаем «всё хорошо», чтобы сценарий теста не расходовался зря.
  bool booting = false;

  List<RequestOptions> to(String path) => requests.where((r) => r.path == path).toList();

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    if (booting) return json(options.path == '/api/auth/me' ? userJson : {'sections': <String, Object?>{}});
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(Object body, {int status = 200, Map<String, List<String>> headers = const {}}) => ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      ...headers,
    });

String jwt(DateTime expires) {
  String part(Map<String, Object?> m) => base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${part({'alg': 'HS256'})}.${part({'exp': expires.millisecondsSinceEpoch ~/ 1000})}.sig';
}

const userJson = {'id': 1, 'first_name': 'Иван', 'registration_status': 'active'};

/// Выход при 401 идёт в фоне (кеш, запрос серверу) — ждём, пока он закончится.
Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 300));

void main() {
  late _MemoryStorage storage;
  late SessionController session;
  SessionController? started;

  Future<void> start(_Server server, {String? token, String? refresh}) async {
    SharedPreferences.setMockInitialValues({'api_origin': 'https://api.example'});
    storage = _MemoryStorage({
      'auth_token': ?token,
      'auth_user': jsonEncode(userJson),
      'auth_refresh': ?refresh,
    });
    session = started = SessionController(storage: storage);
    session.dio.httpClientAdapter = server;
    server.booting = true;
    await session.bootstrap();
    server.booting = false;
    session.realtime.stop();
    server.requests.clear();
  }

  tearDown(() {
    started?.realtime.stop();
    started = null;
  });

  test('разбор cookie обновления и срока токена', () {
    final headers = Headers.fromMap({
      'set-cookie': [
        'auth_access_token=aaa; Path=/; HttpOnly',
        'auth_refresh_token=rrr%2F1; Path=/; HttpOnly; Max-Age=7776000',
      ],
    });
    expect(SessionController.refreshCookieFrom(headers), 'auth_refresh_token=rrr%2F1');
    expect(SessionController.refreshCookieFrom(Headers.fromMap({'set-cookie': ['auth_access_token=aaa']})), isNull);
    expect(SessionController.refreshCookieFrom(Headers()), isNull);
    final at = DateTime.utc(2030, 1, 2, 3, 4, 5);
    expect(SessionController.tokenExpiry(jwt(at))!.toUtc(), at);
    expect(SessionController.tokenExpiry('не-токен'), isNull);
    expect(SessionController.tokenExpiry(null), isNull);
  });

  test('вход запоминает cookie обновления', () async {
    final server = _Server((o) => json({'token': 'T1', 'user': userJson}, headers: {
          'set-cookie': ['auth_refresh_token=R1; Path=/; HttpOnly'],
        }));
    await start(server);
    final error = await session.login('+79990000000', 'pw');
    expect(error, isNull);
    expect(session.token, 'T1');
    expect(storage.values['auth_refresh'], 'auth_refresh_token=R1');
  });

  test('токен истёк (401): сессия продлевается, запрос повторяется с новым токеном, человек остаётся в аккаунте', () async {
    final server = _Server((o) {
      if (o.path == '/api/auth/refresh') {
        return json({'accessToken': 'T2', 'token': 'T2'}, headers: {
          'set-cookie': ['auth_refresh_token=R2; Path=/; HttpOnly'],
        });
      }
      return o.headers['Authorization'] == 'Bearer T2' ? json({'ok': true}) : json({'error': 'expired'}, status: 401);
    });
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    final response = await session.dio.get<Object?>('/api/feed');
    expect(response.statusCode, 200);
    expect(session.token, 'T2');
    expect(session.user, isNotNull);
    expect(server.to('/api/auth/refresh').single.headers['Cookie'], 'auth_refresh_token=R1');
    expect(storage.values['auth_token'], 'T2');
    expect(storage.values['auth_refresh'], 'auth_refresh_token=R2', reason: 'сервер выдал новый — старый больше не годится');
    expect(server.to('/api/feed'), hasLength(2));
  });

  test('сервер отклонил продление: человека выводит на вход', () async {
    final server = _Server((o) => json({'error': 'no'}, status: 401));
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    await expectLater(session.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
    await settle();
    expect(session.token, isNull);
    expect(session.user, isNull);
    expect(storage.values.containsKey('auth_refresh'), isFalse);
  });

  test('нет связи при продлении: из аккаунта не выходим', () async {
    final server = _Server((o) => o.path == '/api/auth/refresh' ? json({'error': 'down'}, status: 503) : json({'error': 'expired'}, status: 401));
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    await expectLater(session.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
    await settle();
    expect(session.token, 'T1');
    expect(session.user, isNotNull);
    expect(storage.values['auth_refresh'], 'auth_refresh_token=R1');
  });

  test('сессия без сохранённого cookie обновления (вошли в старой версии): 401 выводит на вход, как раньше', () async {
    final server = _Server((o) => json({'error': 'expired'}, status: 401));
    await start(server, token: 'T1');
    await expectLater(session.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
    await settle();
    expect(session.token, isNull);
    expect(server.to('/api/auth/refresh'), isEmpty);
  });

  test('повторный запрос снова 401 — выход, без бесконечных попыток', () async {
    final server = _Server((o) => o.path == '/api/auth/refresh' ? json({'accessToken': 'T2'}) : json({'error': 'forbidden'}, status: 401));
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    await expectLater(session.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
    await settle();
    expect(server.to('/api/auth/refresh'), hasLength(1));
    expect(server.to('/api/feed'), hasLength(2));
    expect(session.token, isNull);
  });

  test('неверный пароль при входе (401) не пытается продлевать сессию и не «выходит»', () async {
    final server = _Server((o) => json({'error': 'Неверный пароль'}, status: 401));
    await start(server);
    expect(await session.login('+7999', 'bad'), 'Неверный пароль');
    expect(server.to('/api/auth/refresh'), isEmpty);
  });

  test('токен вот-вот истечёт: продлеваем заранее, запрос сразу уходит с новым токеном без 401', () async {
    final server = _Server((o) {
      if (o.path == '/api/auth/refresh') return json({'accessToken': 'T2'});
      return o.headers['Authorization'] == 'Bearer T2' ? json({'ok': true}) : json({'error': 'expired'}, status: 401);
    });
    await start(server, token: jwt(DateTime.now().add(const Duration(seconds: 30))), refresh: 'auth_refresh_token=R1');
    await session.dio.get<Object?>('/api/feed');
    expect(server.to('/api/feed'), hasLength(1), reason: 'без лишнего круга через 401');
    expect(server.to('/api/auth/refresh'), hasLength(1));
  });

  test('токен свежий: лишнего продления нет', () async {
    final server = _Server((o) => json({'ok': true}));
    await start(server, token: jwt(DateTime.now().add(const Duration(minutes: 40))), refresh: 'auth_refresh_token=R1');
    await session.dio.get<Object?>('/api/feed');
    expect(server.to('/api/auth/refresh'), isEmpty);
  });

  test('несколько запросов упали разом: продление одно (сервер меняет cookie при каждом продлении)', () async {
    final server = _Server((o) {
      if (o.path == '/api/auth/refresh') return json({'accessToken': 'T2'}, headers: {'set-cookie': ['auth_refresh_token=R2; Path=/']});
      return o.headers['Authorization'] == 'Bearer T2' ? json({'ok': true}) : json({'error': 'expired'}, status: 401);
    });
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    final results = await Future.wait([
      session.dio.get<Object?>('/api/a'),
      session.dio.get<Object?>('/api/b'),
      session.dio.get<Object?>('/api/c'),
    ]);
    expect(results.map((r) => r.statusCode), everyElement(200));
    expect(server.to('/api/auth/refresh'), hasLength(1));
  });

  test('загрузка файла, упавшая по 401, повторяется целиком', () async {
    final server = _Server((o) {
      if (o.path == '/api/auth/refresh') return json({'accessToken': 'T2'});
      return o.headers['Authorization'] == 'Bearer T2' ? json({'url': 'https://cdn/x'}) : json({'error': 'expired'}, status: 401);
    });
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    final form = FormData.fromMap({'conversationId': 'c1', 'originalFileName': 'a.txt'});
    final response = await session.dio.post<Object?>('/api/messenger/upload', data: form);
    expect(response.statusCode, 200);
    expect(server.to('/api/messenger/upload'), hasLength(2));
  });

  test('выход отправляет серверу cookie обновления, чтобы он погасил сессию, и стирает её на телефоне', () async {
    final server = _Server((o) => json({'ok': true}));
    await start(server, token: 'T1', refresh: 'auth_refresh_token=R1');
    await session.logout();
    expect(server.to('/api/auth/logout').single.headers['Cookie'], 'auth_refresh_token=R1');
    expect(storage.values.containsKey('auth_refresh'), isFalse);
    expect(storage.values.containsKey('auth_token'), isFalse);
  });
}
