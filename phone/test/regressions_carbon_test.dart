import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/schedule/schedule_controller.dart';
import 'package:molitva/features/service/data/plan_repository.dart';
import 'package:molitva/features/service/logic/plan_logic.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:molitva/features/service/service_page.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'schedule/fakes.dart';

class _Net implements HttpClientAdapter {
  final routes = <String, Object?>{};

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final body = routes[options.path];
    if (body == null) return ResponseBody.fromString('{}', 404, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: ['application/json']});
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

const _plan = {'id': 1, 'service_date': '2026-11-22', 'start_time': '11:00', 'status': 'published', 'share_token': 'SHARE', 'edit_token': 'SECRET-EDIT-TOKEN', 'blocks_count': 1};

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('токены редактирования не лежат на телефоне', () {
    test('копия списка записывается без edit_token, но с нужными полями', () async {
      final net = _Net()..routes['/api/service-plans'] = [_plan];
      final dir = await Directory.systemTemp.createTemp('plans');
      addTearDown(() => dir.delete(recursive: true));
      final repo = PlanRepository(_session(net), cacheDirectory: () async => dir);
      final loaded = await repo.plans(DateTime(2026, 11, 1), DateTime(2026, 12, 1));
      final text = dir.listSync().whereType<File>().map((f) => f.readAsStringSync()).join();
      expect(text.contains('SECRET-EDIT-TOKEN'), isFalse);
      expect(text, contains('SHARE'), reason: 'ссылка на чтение нужна для показа программы');
      expect(loaded.value.single.shareToken, 'SHARE');
    });

    test('копия прежней версии с токеном очищается сразу, даже без сети', () async {
      final net = _Net(); // сервер молчит: 404
      final dir = await Directory.systemTemp.createTemp('plans');
      addTearDown(() => dir.delete(recursive: true));
      final session = _session(net);
      final file = File('${dir.path}/service_list_1.json');
      file.writeAsStringSync(jsonEncode({'origin': session.apiOrigin, 'savedAt': DateTime.now().toIso8601String(), 'data': [_plan]}));
      final repo = PlanRepository(session, cacheDirectory: () async => dir);
      final stale = await repo.plans(DateTime(2026, 11, 1), DateTime(2026, 12, 1));
      expect(file.readAsStringSync().contains('SECRET-EDIT-TOKEN'), isFalse);
      expect(stale.value.single.id, 1, reason: 'список из очищенной копии читается');
    });

    test('stripSecrets оставляет только разрешённые поля', () {
      final out = PlanRepository.stripSecrets([_plan, {'id': 2, 'edit_token': 'x', 'unknown': 1}]);
      expect(out.first.keys, isNot(contains('edit_token')));
      expect(out.last, {'id': 2});
    });
  });

  group('ответы на назначения с одинаковым id', () {
    test('медиа №7 и музыка №7 отвечают независимо', () async {
      final day = DateTime.now().add(const Duration(days: 1));
      final s = FakeScheduleSource()
        ..mine[Ministry.media] = [event(Ministry.media, 1, day, [assignment(7, ivan, role(1, 'Звук'))])]
        ..mine[Ministry.music] = [event(Ministry.music, 2, day, [assignment(7, ivan, role(3, 'Гитара'))])];
      final c = ScheduleController(s, access: const MinistryAccess(roles: ['admin']), userId: 1);
      await c.loadMine();
      final media = c.agenda.firstWhere((i) => i.ministry == Ministry.media);
      final music = c.agenda.firstWhere((i) => i.ministry == Ministry.music);

      final first = c.answer(media, AssignmentStatus.confirmed);
      expect(c.isBusy(media), isTrue);
      expect(c.isBusy(music), isFalse, reason: 'чужое служение не должно «занимать» карточку');
      final second = c.answer(music, AssignmentStatus.declined);
      await Future.wait([first, second]);

      expect(s.statusCalls.length, 2);
      expect(c.agenda.firstWhere((i) => i.ministry == Ministry.media).status, AssignmentStatus.confirmed);
      expect(c.agenda.firstWhere((i) => i.ministry == Ministry.music).status, AssignmentStatus.declined);
    });

    test('повторное нажатие на то же назначение, пока идёт запрос, не дублирует его', () async {
      final day = DateTime.now().add(const Duration(days: 1));
      final s = FakeScheduleSource()..mine[Ministry.media] = [event(Ministry.media, 1, day, [assignment(7, ivan, role(1, 'Звук'))])];
      final c = ScheduleController(s, access: const MinistryAccess(roles: ['admin']), userId: 1);
      await c.loadMine();
      final item = c.agenda.single;
      await Future.wait([c.answer(item, AssignmentStatus.confirmed), c.answer(item, AssignmentStatus.confirmed)]);
      expect(s.statusCalls.length, 1);
    });
  });

  group('песня в программе без названия', () {
    PlanView planWith(List<PlanBlock> blocks) => PlanView(
          summary: PlanSummary(id: 1, date: DateTime(2026, 11, 22), startTime: '11:00', published: true, blocksCount: blocks.length),
          blocks: blocks,
          namesComplete: false,
        );

    test('названия подставляются из песенника, готовые не меняются', () {
      final plan = planWith(const [
        PlanBlock(id: 1, order: 1, title: 'Прославление', durationMinutes: 10, kind: BlockKind.song, songId: 5),
        PlanBlock(id: 2, order: 2, title: 'Прославление', durationMinutes: 10, kind: BlockKind.song, songId: 6, songTitle: 'Своё название', songKey: 'A'),
        PlanBlock(id: 3, order: 3, title: 'Объявления', durationMinutes: 5, kind: BlockKind.other),
      ]);
      final filled = fillSongTitles(plan, {5: (title: 'Велик Бог', key: 'D'), 6: (title: 'Другое', key: 'C')});
      expect(filled.blocks[0].songTitle, 'Велик Бог');
      expect(filled.blocks[0].songKey, 'D');
      expect(filled.blocks[1].songTitle, 'Своё название');
      expect(detailsOf(filled.blocks[0]).songLine, 'Велик Бог [D]');
    });

    test('если подставлять нечего, программа возвращается как есть', () {
      final plan = planWith(const [PlanBlock(id: 1, order: 1, title: 'Прославление', durationMinutes: 10, kind: BlockKind.song, songId: 5)]);
      expect(identical(fillSongTitles(plan, const {}), plan), isTrue);
    });

    testWidgets('в программе без названия всё равно есть строка «Открыть песню»', (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = SessionController();
      s.user = AppUser(id: 1, name: 'И', firstName: 'И', lastName: 'П', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(theme: churchTheme(brightness: Brightness.light), home: ServicePage(source: _OneSongPlan(), songTitles: () async => const {})),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Воскресное служение').first);
      await tester.pumpAndSettle();
      expect(find.text('Открыть песню'), findsOneWidget);
    });
  });
}

class _OneSongPlan implements PlanSource {
  final _summary = PlanSummary(id: 1, date: DateTime.now().add(const Duration(days: 2)), startTime: '11:00', published: true, blocksCount: 1, templateName: 'Воскресное служение');

  @override
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to) async => Loaded([_summary]);

  @override
  Future<Loaded<PlanView>> view(PlanSummary plan) async => Loaded(PlanView(
        summary: plan,
        namesComplete: false,
        blocks: const [PlanBlock(id: 1, order: 1, title: 'Прославление', durationMinutes: 10, kind: BlockKind.song, songId: 5)],
      ));
}
