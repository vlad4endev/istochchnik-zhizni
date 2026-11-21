import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:molitva/features/home/home_controller.dart';
import 'package:molitva/features/home/models/home_models.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/service/models/plan_models.dart';

import 'fake_home.dart';

final _now = DateTime(2026, 11, 21, 12); // суббота

PlanSummary _plan({int id = 1, int? preacher = 7, int? leader = 8, DateTime? date, String start = '10:00'}) => PlanSummary(
      id: id,
      date: date ?? DateTime(2026, 11, 22),
      startTime: start,
      published: true,
      blocksCount: 3,
      totalMinutes: 90,
      preacherId: preacher,
      leaderId: leader,
      shareToken: 'TOKEN',
    );

PlanBlock _sermonBlock() => const PlanBlock(
      id: 1,
      order: 1,
      title: 'Проповедь',
      durationMinutes: 30,
      kind: BlockKind.sermon,
      content: {'sermon_topic': 'Вера и язык', 'sermon_scripture': 'Иак. 3:1-12'},
    );

FakeHome _home() => FakeHome()
  ..plansNow = [_plan()]
  ..blocks = {1: [_sermonBlock()]}
  ..people = {
    7: const ServicePerson(id: 7, name: 'Михаил Самодуров'),
    8: const ServicePerson(id: 8, name: 'Дмитрий Сорокин', avatarUrl: 'https://x/a.jpg'),
  }
  ..eventsNow = [
    {'title': 'Молодёжка', 'event_date': '2026-11-21', 'event_time': '19:00', 'recurrence_type': 'once', 'is_active': true},
  ]
  ..episodesNow = [const Episode(title: 'Проповедь', audioUrl: 'https://x/a.mp3')];

ScheduleAssignment _assign(int id, String role, AssignmentStatus status) => ScheduleAssignment(
      id: id,
      memberId: 9,
      memberName: 'Я',
      role: ScheduleRole(id: id, name: role, color: parseHexColor('#112233')),
      status: status,
    );

ScheduleEvent _musicEvent(List<ScheduleAssignment> a) =>
    ScheduleEvent(ministry: Ministry.music, planId: 1, title: 'Воскресное богослужение', date: DateTime(2026, 11, 22), startTime: '10:00', assignments: a);

HomeController _make(FakeHome h, FakeSchedule s) => HomeController(h, s, meId: 9, clock: () => _now);

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('загрузка', () {
    test('все части на месте: карточка служения собрана из плана, блоков и профилей', () async {
      final c = _make(_home(), FakeSchedule());
      await c.load();
      expect(c.loading, isFalse);
      expect(c.error, isNull);
      final s = c.service!;
      expect((s.preacher.name, s.host!.name, s.topic, s.scripture), ('Михаил Самодуров', 'Дмитрий Сорокин', 'Вера и язык', 'Иак. 3:1-12'));
      expect(s.host!.avatarUrl, 'https://x/a.jpg');
      expect(s.phase, ServicePhase.upcoming);
      expect(c.events, hasLength(1));
      expect(c.episodes.single.title, 'Проповедь');
    });

    test('нет профиля у проповедника или ведущего — подписи по умолчанию, карточка остаётся', () async {
      final h = _home()..people = {};
      final c = _make(h, FakeSchedule());
      await c.load();
      expect(c.service!.preacher.name, 'Проповедник');
      expect(c.service!.host!.name, 'Ведущий');
    });

    test('нет ведущего — карточка без ведущего', () async {
      final h = _home()..plansNow = [_plan(leader: null)];
      final c = _make(h, FakeSchedule());
      await c.load();
      expect(c.service!.host, isNull);
    });

    test('нет проповедника, темы или стиха — карточки нет, а остальное грузится', () async {
      final noPreacher = _home()..plansNow = [_plan(preacher: null)];
      final c1 = _make(noPreacher, FakeSchedule());
      await c1.load();
      expect(c1.service, isNull);
      expect(c1.events, isNotEmpty);

      final noSermon = _home()..blocks = {1: const []};
      final c2 = _make(noSermon, FakeSchedule());
      await c2.load();
      expect(c2.service, isNull);
    });

    test('служение на сегодня после окончания: окно отзывов, можно оценить', () async {
      final h = _home()..plansNow = [_plan(date: DateTime(2026, 11, 21), start: '09:00')]; // идёт до 10:30, сейчас 12:00
      final c = _make(h, FakeSchedule());
      await c.load();
      expect(c.service!.phase, ServicePhase.feedback);
      expect(c.service!.canRate, isTrue);
    });

    test('сбой одной части не прячет остальные', () async {
      final h = _home()
        ..failEpisodes = true
        ..failPlans = true;
      final c = _make(h, FakeSchedule());
      await c.load();
      expect(c.error, isNull);
      expect(c.service, isNull);
      expect(c.episodes, isEmpty);
      expect(c.events, isNotEmpty);
      expect(c.day['members'], isNotEmpty);
    });

    test('в первый раз не пришло ничего — ошибка с понятным текстом', () async {
      final c = _make(_home()..failAll = true, FakeSchedule());
      await c.load();
      expect(c.error, contains('Не удалось загрузить главную'));
      expect(c.loading, isFalse);
    });

    test('обновление без сети оставляет прежнее и не показывает ошибку', () async {
      final h = _home();
      final c = _make(h, FakeSchedule());
      await c.load();
      h.failAll = true;
      await c.load();
      expect(c.error, isNull);
      expect(c.service, isNotNull);
      expect(c.events, isNotEmpty);
    });

    test('«трансляции нет» — тоже ответ и снимает прежнюю; сбой сети — нет', () async {
      final h = _home()..broadcastNow = const BroadcastInfo(status: 'live', title: 'Служение');
      final c = _make(h, FakeSchedule());
      await c.load();
      expect(c.broadcast, isNotNull);
      h.failBroadcast = true;
      await c.load();
      expect(c.broadcast, isNotNull, reason: 'сбой не затирает');
      h.failBroadcast = false;
      h.broadcastNow = null;
      await c.load();
      expect(c.broadcast, isNull, reason: 'пришёл пустой ответ');
    });
  });

  group('«твоё служение на этой неделе»', () {
    test('берётся воскресенье служения; музыка, трансляция и воскресное собрание — вместе', () async {
      final s = FakeSchedule()
        ..music = [_musicEvent([_assign(1, 'Гитара', AssignmentStatus.pending)])]
        ..sunday = [
          SundayPlan(id: 3, date: DateTime(2026, 11, 22), startTime: '10:00', published: true, leader: const PersonRef(id: 9, name: 'Я')),
        ];
      final c = _make(_home(), s);
      await c.load();
      expect(c.myService.map((m) => m.ministry), [ServiceMinistry.sunday, ServiceMinistry.music]);
      expect(s.calls, containsAll(['mine:music', 'mine:media', 'mineSunday']));
    });

    test('нет доступа к музыке (403) — это не ошибка, остальное показывается', () async {
      final s = FakeSchedule()
        ..noAccessMusic = true
        ..media = [
          ScheduleEvent(ministry: Ministry.media, planId: 2, title: 'Эфир', date: DateTime(2026, 11, 22), startTime: '10:00', assignments: [_assign(4, 'Звук', AssignmentStatus.confirmed)]),
        ];
      final c = _make(_home(), s);
      await c.load();
      expect(c.myService.single.ministry, ServiceMinistry.media);
    });

    test('без сети прежнее расписание остаётся', () async {
      final s = FakeSchedule()..music = [_musicEvent([_assign(1, 'Гитара', AssignmentStatus.confirmed)])];
      final c = _make(_home(), s);
      await c.load();
      s.fail = true;
      await c.load();
      expect(c.myService, hasLength(1));
    });

    test('«Подтвердить»: каждая ожидающая позиция получает ответ, список обновляется', () async {
      final s = FakeSchedule()
        ..music = [
          _musicEvent([
            _assign(1, 'Гитара', AssignmentStatus.pending),
            _assign(2, 'Вокал', AssignmentStatus.assigned),
            _assign(3, 'Бас', AssignmentStatus.confirmed),
          ]),
        ];
      final c = _make(_home(), s);
      await c.load();
      final card = c.myService.single;
      expect(card.pending, hasLength(2));
      final f = c.answer(card, AssignmentStatus.confirmed);
      expect(c.answering, {card.key});
      await f;
      expect(c.answering, isEmpty);
      expect(s.calls.where((x) => x.startsWith('status:')), ['status:music:1:confirmed', 'status:music:2:confirmed']);
      expect(c.myService.single.status, AssignmentStatus.confirmed);
      expect(c.answerError, isNull);
    });

    test('«Отказать» и ошибка сети: сообщение, карточка не зависает в «занято»', () async {
      final s = FakeSchedule()..music = [_musicEvent([_assign(1, 'Гитара', AssignmentStatus.pending)])];
      final c = _make(_home(), s);
      await c.load();
      s.failStatus = true;
      await c.answer(c.myService.single, AssignmentStatus.declined);
      expect(c.answerError, contains('Не удалось сохранить ответ'));
      expect(c.answering, isEmpty);
      expect(c.myService.single.status, AssignmentStatus.pending, reason: 'ничего не изменилось');
    });

    test('повторный тап во время ответа не шлёт запросы дважды', () async {
      final s = FakeSchedule()..music = [_musicEvent([_assign(1, 'Гитара', AssignmentStatus.pending)])];
      final c = _make(_home(), s);
      await c.load();
      final card = c.myService.single;
      final first = c.answer(card, AssignmentStatus.confirmed);
      final second = c.answer(card, AssignmentStatus.confirmed);
      await Future.wait([first, second]);
      expect(s.calls.where((x) => x.startsWith('status:')), hasLength(1));
    });
  });
}
