import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/http_cache.dart';

class _Net implements HttpClientAdapter {
  final routes = <String, Object?>{};
  bool offline = false;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add('${options.method} ${options.path}');
    if (offline) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    final body = routes[options.path];
    if (body == null) return ResponseBody.fromString('{}', 404, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

class _Rig {
  _Rig({Directory? dir}) {
    dio = Dio(BaseOptions(baseUrl: 'https://x.test'))..httpClientAdapter = net;
    cache = HttpCache(dio: dio, userId: () => user, directory: () async => dir, recheckAfter: Duration.zero);
    dio.interceptors.add(cache);
  }
  int? user = 1;
  final net = _Net();
  late final Dio dio;
  late final HttpCache cache;

  int count(String call) => net.calls.where((c) => c == call).length;

  /// Дать фоновым проверкам закончиться.
  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 30));
}

/// Ждёт, пока запись на диск закончится (файл есть и целый).
Future<void> _diskReady(Directory dir) async {
  for (var i = 0; i < 100; i++) {
    final folder = Directory('${dir.path}/http_cache/1');
    if (folder.existsSync()) {
      final files = folder.listSync().whereType<File>().toList();
      if (files.isNotEmpty && files.every((f) => f.readAsStringSync().contains('\n'))) return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  fail('кеш не записался на диск');
}

void main() {
  test('первый раз — с сервера и в память; второй — мгновенно из памяти, а фоном спрашивает сервер', () async {
    final r = _Rig();
    r.net.routes['/api/feed'] = {'posts': [1]};
    expect((await r.dio.get<Object?>('/api/feed')).data, {'posts': [1]});
    expect(r.cache.has('/api/feed'), isTrue);

    r.net.routes['/api/feed'] = {'posts': [1, 2]};
    final second = await r.dio.get<Object?>('/api/feed');
    expect(second.data, {'posts': [1]}, reason: 'сначала показываем то, что уже было');
    expect(second.extra['fromCache'], isTrue);
    await r.settle();
    expect(r.count('GET /api/feed'), 2, reason: 'фоновая проверка ушла на сервер');
    expect((await r.dio.get<Object?>('/api/feed')).data, {'posts': [1, 2]}, reason: 'свежее уже сохранено');
  });

  test('если фоном пришло другое — экранам сообщают; если то же самое — нет', () async {
    final r = _Rig();
    r.net.routes['/api/calendar/events'] = [1];
    await r.dio.get<Object?>('/api/calendar/events');
    final seen = <String>[];
    r.cache.changes.listen(seen.add);

    await r.dio.get<Object?>('/api/calendar/events');
    await r.settle();
    expect(seen, isEmpty, reason: 'данные те же — перерисовывать нечего');

    r.net.routes['/api/calendar/events'] = [1, 2];
    await r.dio.get<Object?>('/api/calendar/events');
    await r.settle();
    expect(seen, ['/api/calendar/events']);
  });

  test('чужие и «живые» адреса не сохраняются: звонок, счётчик, сообщения', () async {
    final r = _Rig();
    for (final p in ['/api/calls/5', '/api/messenger/unread-count', '/api/messenger/conversations/3/messages', '/api/notifications/status']) {
      r.net.routes[p] = {'a': 1};
      await r.dio.get<Object?>(p);
      await r.dio.get<Object?>(p);
    }
    await r.settle();
    expect(r.net.calls.length, 8, reason: 'каждый запрос ушёл на сервер');
  });

  test('без сети: сохранённое показывается, а ошибка фоновой проверки не вылезает', () async {
    final r = _Rig();
    r.net.routes['/api/feed'] = {'posts': [1]};
    await r.dio.get<Object?>('/api/feed');
    r.net.offline = true;
    final res = await r.dio.get<Object?>('/api/feed');
    expect(res.data, {'posts': [1]});
    await r.settle();
  });

  test('без сети и без сохранённого — обычная ошибка', () async {
    final r = _Rig()..net.offline = true;
    await expectLater(r.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
  });

  test('аккаунты не видят данные друг друга; без входа ничего не сохраняется', () async {
    final r = _Rig();
    r.net.routes['/api/feed'] = {'posts': ['мои']};
    await r.dio.get<Object?>('/api/feed');
    r.user = 2;
    r.net.routes['/api/feed'] = {'posts': ['чужие']};
    expect((await r.dio.get<Object?>('/api/feed')).data, {'posts': ['чужие']}, reason: 'у второго своего нет — идёт на сервер');
    r.user = null;
    r.net.routes['/api/stories'] = {'groups': []};
    await r.dio.get<Object?>('/api/stories');
    expect(r.cache.has('/api/stories'), isFalse);
  });

  test('своё изменение стирает сохранённое по разделу сразу: старое не мелькает', () async {
    final r = _Rig();
    r.net.routes['/api/service-plans/1'] = {'notes': 'старое'};
    r.net.routes['/api/sunday-schedule/my'] = {'x': 1};
    r.net.routes['/api/feed'] = {'posts': []};
    for (final p in ['/api/service-plans/1', '/api/sunday-schedule/my', '/api/feed']) {
      await r.dio.get<Object?>(p);
    }
    final seen = <String>[];
    r.cache.changes.listen(seen.add);
    r.net.routes['/api/media-schedule/assign'] = {'ok': true};
    r.net.routes['/api/service-plans/1'] = {'notes': 'новое'};
    // POST через адаптер: достаточно, что он завершился успешно.
    final adapterPost = await r.dio.post<Object?>('/api/media-schedule/assign');
    expect(adapterPost.statusCode, 200);
    expect(r.cache.has('/api/service-plans/1'), isFalse, reason: 'расписание и программа — одна «семья»');
    expect(r.cache.has('/api/sunday-schedule/my'), isFalse);
    expect(r.cache.has('/api/feed'), isTrue, reason: 'лента — другой раздел');
    await r.settle();
    expect(seen, containsAll(['/api/service-plans/1', '/api/sunday-schedule/my']));
    expect((await r.dio.get<Object?>('/api/service-plans/1')).data, {'notes': 'новое'});
  });

  test('потянули вниз (fresh): сохранённое пропускается, берётся с сервера', () async {
    final r = _Rig();
    r.net.routes['/api/feed'] = {'posts': [1]};
    await r.dio.get<Object?>('/api/feed');
    r.net.routes['/api/feed'] = {'posts': [1, 2]};
    final res = await HttpCache.fresh(() => r.dio.get<Object?>('/api/feed'));
    expect(res.data, {'posts': [1, 2]});
    expect(res.extra['fromCache'], isNull);
  });

  test('revalidateRecent: подтягивает недавно открытое одним махом', () async {
    final r = _Rig();
    r.net.routes['/api/feed'] = {'posts': [1]};
    r.net.routes['/api/stories'] = {'groups': []};
    await r.dio.get<Object?>('/api/feed');
    await r.dio.get<Object?>('/api/stories');
    final seen = <String>[];
    r.cache.changes.listen(seen.add);
    r.net.routes['/api/feed'] = {'posts': [1, 2]};
    await r.cache.revalidateRecent();
    await r.settle();
    expect(seen, ['/api/feed']);
  });

  test('на диске: после перезапуска приложения данные на месте и открываются мгновенно; выход всё стирает', () async {
    final dir = await Directory.systemTemp.createTemp('http_cache_test');
    addTearDown(() async {
      await Future<void>.delayed(const Duration(milliseconds: 80)); // фоновая запись кеша могла ещё идти
      try {
        await dir.delete(recursive: true);
      } catch (_) {}
    });
    final a = _Rig(dir: dir);
    a.net.routes['/api/feed'] = {'posts': ['кириллица ✓']};
    await a.dio.get<Object?>('/api/feed');
    await _diskReady(dir);

    final b = _Rig(dir: dir);
    b.net.offline = true;
    await b.cache.warm(); // как при запуске приложения
    final res = await b.dio.get<Object?>('/api/feed');
    expect(res.data, {'posts': ['кириллица ✓']});
    expect(res.extra['fromCache'], isTrue);

    final c = _Rig(dir: dir);
    await c.cache.warm();
    expect(c.cache.has('/api/feed'), isTrue);
    await c.cache.clear();
    final d = _Rig(dir: dir)..net.offline = true;
    await d.cache.warm();
    await expectLater(d.dio.get<Object?>('/api/feed'), throwsA(isA<DioException>()));
  });

  test('повреждённый файл не ломает запрос', () async {
    final dir = await Directory.systemTemp.createTemp('http_cache_test');
    addTearDown(() async {
      await Future<void>.delayed(const Duration(milliseconds: 80)); // фоновая запись кеша могла ещё идти
      try {
        await dir.delete(recursive: true);
      } catch (_) {}
    });
    final a = _Rig(dir: dir);
    a.net.routes['/api/feed'] = {'posts': [1]};
    await a.dio.get<Object?>('/api/feed');
    await _diskReady(dir);
    for (final f in Directory('${dir.path}/http_cache/1').listSync().whereType<File>()) {
      f.writeAsStringSync('мусор');
    }
    final b = _Rig(dir: dir);
    await b.cache.warm();
    b.net.routes['/api/feed'] = {'posts': [1]};
    expect((await b.dio.get<Object?>('/api/feed')).data, {'posts': [1]}, reason: 'файл не прочитался — берём с сервера');
  });

  test('список разрешённых адресов', () {
    for (final p in ['/api/feed', '/api/calendar/2026-11-22', '/api/messenger/conversations', '/api/service-plans', '/api/service-plans/12', '/api/studio/setlists/4/performance', '/api/music-schedule/my-schedule']) {
      expect(isCacheablePath(p), isTrue, reason: p);
    }
    for (final p in ['/api/calls/5', '/api/messenger/unread-count', '/api/messenger/conversations/3/messages', '/api/auth/me', '/api/notifications/status', '/api/bible/chapter/a/b/1', '/api/songs']) {
      expect(isCacheablePath(p), isFalse, reason: p);
    }
  });
}
