import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/features/schedule/data/schedule_repository.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/service/data/plan_repository.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:shared_preferences/shared_preferences.dart';


/// Отвечает по таблице путь → (код, тело); недостающее — обрыв сети.
class _Net implements HttpClientAdapter {
  final routes = <String, (int, Object?)>{};
  bool offline = false;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(options.path);
    if (offline) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    final hit = routes[options.path];
    if (hit == null) return ResponseBody.fromString('{}', 404, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString(jsonEncode(hit.$2), hit.$1, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

SessionController _session(_Net net) {
  final s = SessionController();
  s.user = AppUser(id: 1, name: 'И', firstName: 'И', lastName: 'П', role: 'member', roles: const ['member'], registrationStatus: 'active');
  s.dio.httpClientAdapter = net;
  return s;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('программа: ссылка устарела (404), справочники закрыты (403)', () async {
    final net = _Net();
    net.routes['/api/service-plans/1'] = (200, {
      'id': 1,
      'notes': 'Заметка',
      'blocks': [
        {'id': 1, 'block_type_id': 10, 'order_index': 1, 'title': 'Прославление', 'duration_minutes': 20, 'song_id': 5, 'assigned_member_id': 4, 'content_json': {}, 'block_type_code': 'song'},
        {'id': 2, 'block_type_id': 11, 'order_index': 2, 'title': 'Проповедь', 'duration_minutes': 40, 'assigned_member_id': 2, 'content_json': {'sermon_topic': 'Любовь'}, 'block_type_code': 'sermon'},
      ],
    });
    net.routes['/api/service-block-types'] = (200, [
      {'id': 10, 'name': 'Песня'},
      {'id': 11, 'name': 'Проповедь'},
    ]);
    net.routes['/api/service-planner-members'] = (403, {'error': 'нет прав'});
    final dir = await Directory.systemTemp.createTemp('plans');
    addTearDown(() => dir.delete(recursive: true));
    final repo = PlanRepository(_session(net), cacheDirectory: () async => dir);
    final summary = PlanSummary(id: 1, date: DateTime(2026, 11, 22), startTime: '11:00', published: true, blocksCount: 2, shareToken: 'A' * 36, leaderId: 1);
    final view = (await repo.view(summary)).value;
    expect(view.blocks.length, 2);
    expect(view.blocks.first.kind, BlockKind.song);
    expect(view.namesComplete, isFalse);
  });

  test('программа: сохранённая программа и список открываются без сети, но актуальная копия не затирается обедневшей', () async {
    final net = _Net();
    net.routes['/api/public/service-plans/${'A' * 36}'] = (200, {
      'plan': {'leader_name': 'Иван Петров', 'preacher_name': 'Мария Сидорова', 'notes': ''},
      'blocks': [
        {'id': 1, 'order_index': 1, 'title': 'Прославление', 'duration_minutes': 20, 'song_id': 5, 'song_title': 'Велик Бог', 'song_key': 'D', 'block_type_code': 'song', 'content_json': {}},
      ],
    });
    final dir = await Directory.systemTemp.createTemp('plans');
    addTearDown(() => dir.delete(recursive: true));
    final repo = PlanRepository(_session(net), cacheDirectory: () async => dir);
    final summary = PlanSummary(id: 1, date: DateTime(2026, 11, 22), startTime: '11:00', published: true, blocksCount: 1, shareToken: 'A' * 36);
    await repo.view(summary);
    net.offline = true;
    final offline = await repo.view(summary);
    expect(offline.staleSince, isNotNull);
    expect(offline.value.blocks.first.songTitle, 'Велик Бог');
  });

  test('расписание: лента из копии и 403 как «нет доступа»', () async {
    final net = _Net();
    net.routes['/api/media-schedule/my-schedule'] = (200, {
      'events': [
        {'id': 1, 'event_ref_id': 1, 'title': 'Служение', 'event_date': '2026-11-22', 'start_time': '11:00', 'assignments': [
          {'id': 3, 'member_id': 1, 'role_id': 1, 'status': 'assigned', 'member': {'id': 1, 'name': 'Иван'}, 'role': {'id': 1, 'name': 'Звук', 'color': '#0891b2'}},
        ]},
      ],
    });
    net.routes['/api/music-schedule/my-schedule'] = (403, {'error': 'Раздел доступен только музыкантам'});
    final dir = await Directory.systemTemp.createTemp('sched');
    addTearDown(() => dir.delete(recursive: true));
    final repo = ScheduleRepository(_session(net), cacheDirectory: () async => dir);
    final ok = await repo.myEvents(Ministry.media, DateTime(2026, 11, 1), DateTime(2026, 12, 1));
    expect(ok.items.single.assignments.single.role.name, 'Звук');
    await expectLater(repo.myEvents(Ministry.music, DateTime(2026, 11, 1), DateTime(2026, 12, 1)), throwsA(isA<NoAccessException>()));
    net.offline = true;
    final stale = await repo.myEvents(Ministry.media, DateTime(2026, 11, 1), DateTime(2026, 12, 1));
    expect(stale.staleSince, isNotNull);
    expect(stale.items.length, 1);
  });
}
