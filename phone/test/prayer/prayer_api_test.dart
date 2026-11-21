import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/features/prayer/data/prayer_source.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';

class _Call {
  _Call(this.method, this.path, this.query, this.body);
  final String method;
  final String path;
  final Map<String, dynamic> query;
  final Object? body;
}

/// Записывает запросы и отдаёт заготовленные ответы — проверяем, что именно уходит на сервер.
class _Net implements HttpClientAdapter {
  final calls = <_Call>[];
  final routes = <String, Object?>{};
  int status = 200;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(_Call(options.method, options.path, options.queryParameters, options.data));
    final body = routes[options.path] ?? <String, dynamic>{};
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Net net;
  late PrayerApi api;

  setUp(() {
    net = _Net();
    final session = SessionController();
    session.dio.httpClientAdapter = net;
    api = PrayerApi(session);
  });

  _Call last() => net.calls.last;

  test('заметки: чтение на день, чтение «для правки», сохранение и удаление', () async {
    net.routes['/api/calendar/dashboard-coordinator-notes'] = {
      'urgent_prayer': {'text': 'Срочно', 'start_date': '2026-11-21', 'end_date': '2026-11-22'},
      'announcement': null,
    };
    final notes = await api.notes('2026-11-21');
    expect(last().method, 'GET');
    expect(last().query, {'for_date': '2026-11-21'});
    expect(notes.urgent!.text, 'Срочно');
    // 21 ноября 2026 — суббота, 22-е — воскресенье той же недели.
    expect(notes.urgent!.duration, NoteDuration.week);

    await api.manageNotes();
    expect(last().query, {'scope': 'manage'});

    await api.saveNote(NoteKind.announcement, 'Собрание', NoteDuration.month, '2026-11-21');
    expect(last().method, 'POST');
    expect(last().body, {'kind': 'announcement', 'text': 'Собрание', 'duration': 'month', 'today_key': '2026-11-21'});

    await api.deleteNote(NoteKind.urgentPrayer, '2026-11-21');
    expect(last().method, 'DELETE');
    expect(last().path, '/api/calendar/dashboard-coordinator-notes/urgent_prayer');
    expect(last().query, {'for_date': '2026-11-21'});
  });

  test('план недели и отметки сбора: параметры и разбор настоящих ответов', () async {
    net.routes['/api/calendar/next-week/members'] = {
      'week': 'next',
      'days': [
        {
          'date': '2026-11-30',
          'member': {
            'id': 12,
            'name': 'Иван Петров',
            'first_name': 'Иван',
            'last_name': 'Петров',
            'prayer_request': null,
            'in_prayer_cycle': true,
            'previous_manual_prayer_needs': [
              {'id': 3, 'note': 'Было: работа', 'created_at': '2026-10-01T10:00:00.000Z', 'source': 'manual'},
            ],
          },
        },
      ],
    };
    net.routes['/api/calendar/cycle/collection-claims'] = {
      'cycle_index': 2,
      'cycle_number': 3,
      'coordinators': [
        {'id': 5, 'name': 'Мария Лис', 'first_name': 'Мария', 'last_name': 'Лис'},
      ],
      'members': [
        {'id': 12, 'name': 'Иван Петров', 'claimed_by': null, 'can_toggle': true},
      ],
    };
    final days = await api.week(WeekKind.next);
    expect(last().query, {'week': 'next'});
    expect(days.single.member!.displayName, 'Петров Иван');
    expect(days.single.member!.hasNeed, isFalse);
    expect(days.single.member!.previousNeeds.single.note, 'Было: работа');

    final claims = await api.claims(WeekKind.current);
    expect(last().query, {'week': 'current'});
    expect(claims.coordinators.single.id, 5);
    expect(claims.of(12)!.claimedBy, isNull);
  });

  test('куратор: назначение и снятие', () async {
    await api.assignCurator(12, 5, WeekKind.next);
    expect(last().method, 'PATCH');
    expect(last().path, '/api/calendar/cycle/collection-claims');
    expect(last().body, {'member_id': 12, 'claim': true, 'week': 'next', 'assigned_coordinator_id': 5});
    await api.assignCurator(12, null, WeekKind.next);
    expect(last().body, {'member_id': 12, 'claim': false, 'week': 'next'});
  });

  test('автораспределение, нужда и ИИ-улучшение', () async {
    net.routes['/api/calendar/next-week/curator-distribution'] = {'ok': true, 'total': 14, 'pushed_coordinators': 3};
    final r = await api.autoDistribute(WeekKind.current);
    expect(last().body, {'week_kind': 'current', 'notify_curators': true});
    expect((r.total, r.notified), (14, 3));

    await api.saveNeed(12, '2026-11-30', 'О здоровье');
    expect(last().method, 'PATCH');
    expect(last().path, '/api/calendar/member-cycle-prayer');
    expect(last().body, {'member_id': 12, 'target_date': '2026-11-30', 'prayer_request': 'О здоровье'});

    net.routes['/api/calendar/prayer-need/improve-text'] = {'text': 'Просим о здоровье'};
    expect(await api.improveText('о здоровье', 'Петров Иван'), 'Просим о здоровье');
    expect(last().body, {'text': 'о здоровье', 'member_name': 'Петров Иван'});

    net.routes['/api/calendar/prayer-need/improve-text'] = {'text': '  '};
    await expectLater(api.improveText('x', ''), throwsStateError);
  });

  test('посещения раздела, рассылка Telegram, именинники, нужда в чат', () async {
    net.routes['/api/calendar/prayer-section/today-viewers'] = {
      'date': '2026-11-21',
      'unique_viewers_today': 1,
      'viewers': [
        {'member_id': 3, 'name': 'Анна Орлова', 'first_name': 'Анна', 'last_name': 'Орлова', 'avatar_url': null, 'first_seen_at': '2026-11-21T08:30:00.000Z'},
      ],
    };
    final v = await api.viewers();
    expect(v.count, 1);
    expect(v.viewers.single.person.displayName, 'Орлова Анна');
    await api.registerVisit();
    expect((last().method, last().path), ('POST', '/api/calendar/prayer-section/visit'));

    net.routes['/api/telegram/dispatch/preview-prayer'] = {'text': 'Молитва дня', 'date': '2026-11-21'};
    expect(await api.telegramPreview('2026-11-21'), 'Молитва дня');
    expect(last().query, {'date': '2026-11-21'});
    net.routes['/api/telegram/dispatch/run-now'] = {'ok': true, 'sent_count': 12, 'mode': 'all'};
    expect(await api.telegramSendNow('2026-11-21'), 12);
    expect(last().body, {'date': '2026-11-21'});

    net.routes['/api/calendar/birthdays/week'] = {
      'week_start': '2026-11-16',
      'week_end': '2026-11-22',
      'items': [
        {'id': 1, 'name': 'Анна', 'birth_date': '1990-11-21', 'week_date': '2026-11-21'},
      ],
    };
    expect((await api.birthdays()).single.name, 'Анна');

    await api.submitNeed('Прошу молитвы');
    expect((last().method, last().path), ('POST', '/api/calendar/prayer-need/submit'));
    expect(last().body, {'text': 'Прошу молитвы'});
  });

  test('ошибка сервера доходит как DioException с текстом', () async {
    net.status = 403;
    net.routes['/api/calendar/next-week/members'] = {'error': 'Нет доступа к разделу плана недели'};
    await expectLater(api.week(WeekKind.next), throwsA(isA<DioException>()));
  });

  test('пользователь: флаг «ответственный за сбор» читается и сохраняется', () {
    final user = AppUser.fromJson({
      'id': 1,
      'name': 'Мария Лис',
      'app_role': 'member',
      'app_roles': ['member'],
      'is_collection_coordinator': true,
    });
    expect(user.isCollectionCoordinator, isTrue);
    expect(AppUser.fromJson(user.toJson()).isCollectionCoordinator, isTrue);
    expect(AppUser.fromJson({'id': 2, 'name': 'X'}).isCollectionCoordinator, isFalse);
    expect(AppUser.fromJson({'id': 3, 'name': 'P', 'app_role': 'pastor'}).isPastor, isTrue);
  });
}
