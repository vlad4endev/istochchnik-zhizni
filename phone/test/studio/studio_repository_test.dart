import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/features/studio/data/studio_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';


class _Net implements HttpClientAdapter {
  final routes = <String, Object?>{};
  bool offline = false;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (offline) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    final body = routes[options.path];
    if (body == null) return ResponseBody.fromString('{}', 404, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

SessionController _session(_Net net) {
  final s = SessionController();
  s.user = AppUser(id: 1, name: 'И', firstName: 'И', lastName: 'П', role: 'musician', roles: const ['musician'], registrationStatus: 'active');
  s.dio.httpClientAdapter = net;
  // Здесь проверяется собственная копия репозитория на диске, поэтому копию ответов в памяти выключаем.
  s.dio.interceptors.remove(s.cache);
  return s;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('сетлисты и песни: настоящие ответы сервера (id строками) читаются, после обрыва сети — из копии', () async {
    final net = _Net();
    net.routes['/api/studio/setlists'] = [
      {'id': '9', 'member_id': 1, 'title': 'Воскресенье', 'event_date': '2026-11-22', 'is_public': false, 'share_token': 'T', 'source_service_plan_id': null, 'created_at': 'x', 'updated_at': 'y'},
    ];
    net.routes['/api/studio/setlists/9/performance'] = {
      'setlist': {'id': '9', 'member_id': 1, 'title': 'Воскресенье', 'event_date': '2026-11-22', 'is_public': false, 'share_token': 'T', 'source_service_plan_id': null},
      'items': [
        {'id': '31', 'setlist_id': '9', 'position': 0, 'song_id': '5', 'studio_version_id': null, 'effective_key': 'G', 'effective_content': '[G]текст', 'musician_notes': {'v': 1, 'lineComments': {'0': 'тише'}}, 'song': {'id': '5', 'title': 'Велик Бог', 'default_key': 'G', 'tempo': 72}},
      ],
    };
    final dir = await Directory.systemTemp.createTemp('studio');
    addTearDown(() => dir.delete(recursive: true));
    final repo = StudioRepository(_session(net), cacheDirectory: () async => dir);
    final lists = await repo.setlists();
    final detail = await repo.performance(9);
    net.offline = true;
    final lists2 = await repo.setlists();
    final detail2 = await repo.performance(9);
    expect(lists.value.single.id, 9);
    expect(detail.value.items.single.songId, 5);
    expect(lists2.staleSince, isNotNull);
    expect(detail2.value.items.single.notes.lines[0], 'тише');
  });
}
