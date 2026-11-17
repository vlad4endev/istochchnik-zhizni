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

/// Записывает каждый запрос и отвечает пустым JSON, не выходя в сеть.
class _RecordingAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

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

void main() {
  test('смена сервера завершает сессию и не отправляет токен на новый адрес', () async {
    SharedPreferences.setMockInitialValues({'api_origin': 'https://old.example'});
    final storage = _MemoryStorage({
      'auth_token': 'secret-token',
      'auth_user': jsonEncode({'id': 1, 'first_name': 'Иван', 'registration_status': 'active'}),
    });
    final session = SessionController(storage: storage);
    final adapter = _RecordingAdapter();
    session.dio.httpClientAdapter = adapter;
    await session.bootstrap();
    session.realtime.stop();
    expect(session.token, 'secret-token');

    adapter.requests.clear();
    await session.setApiOrigin('https://other.example/');

    expect(session.apiOrigin, 'https://other.example');
    expect(session.token, isNull);
    expect(session.user, isNull);
    expect(storage.values.containsKey('auth_token'), isFalse);
    // Выход ушёл на прежний сервер, а на новый токен не отправлялся.
    expect(adapter.requests.single.uri.toString(), 'https://old.example/api/auth/logout');

    await session.dio.get<Object?>('/api/feed');
    expect(adapter.requests.last.uri.host, 'other.example');
    expect(adapter.requests.last.headers['Authorization'], isNull);
  });

  test('тот же адрес не завершает сессию', () async {
    SharedPreferences.setMockInitialValues({'api_origin': 'https://old.example'});
    final storage = _MemoryStorage({
      'auth_token': 'secret-token',
      'auth_user': jsonEncode({'id': 1, 'first_name': 'Иван', 'registration_status': 'active'}),
    });
    final session = SessionController(storage: storage);
    session.dio.httpClientAdapter = _RecordingAdapter();
    await session.bootstrap();
    session.realtime.stop();

    await session.setApiOrigin('https://old.example/');
    expect(session.token, 'secret-token');
  });
}
