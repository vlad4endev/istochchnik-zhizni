import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/schedule/schedule_controller.dart';

import 'fakes.dart';

// Среда, 19 ноября 2026: понедельник этой недели — 16 ноября.
final _now = DateTime(2026, 11, 18, 10);
final _sunday = DateTime(2026, 11, 22);

ScheduleController _make(FakeScheduleSource s, {MinistryAccess access = const MinistryAccess(roles: ['admin'])}) =>
    ScheduleController(s, access: access, userId: ivan.id, clock: () => _now);

void main() {
  group('мои назначения', () {
    test('ленту собирают из трёх служений и сортируют по дате и времени', () async {
      final s = FakeScheduleSource()
        ..mine[Ministry.media] = [
          event(Ministry.media, 10, DateTime(2026, 11, 29), [assignment(5, ivan, role(1, 'Звук'))]),
          event(Ministry.media, 11, _sunday, [assignment(6, ivan, role(2, 'Камера'), AssignmentStatus.confirmed)], time: '09:30'),
        ]
        ..mine[Ministry.music] = [
          event(Ministry.music, 20, _sunday, [assignment(7, ivan, role(3, 'Гитара'))]),
        ]
        ..mineSunday = [
          SundayPlan(id: 3, date: _sunday, startTime: '11:00', published: true, leader: ivan, preacher: maria),
          SundayPlan(id: 4, date: DateTime(2026, 12, 6), startTime: '11:00', published: true, leader: ivan, preacher: ivan),
        ];
      final c = _make(s);
      await c.loadMine();

      expect([for (final i in c.agenda) '${i.date.day}.${i.date.month} ${i.startTime} ${i.ministry.name} ${i.roleName}'], [
        '22.11 09:30 media Камера',
        '22.11 11:00 media Звук'.replaceFirst('media Звук', 'music Гитара'),
        '22.11 11:00 sunday Ведущий',
        '29.11 11:00 media Звук',
        '6.12 11:00 sunday Ведущий и Проповедник',
      ]);
      expect(c.next!.roleName, 'Камера');
      expect(c.pending.length, 2, reason: 'Гитара и Звук ещё без ответа; воскресные назначения ответа не требуют');
    });

    test('прошедшее не показывается, сегодняшнее остаётся', () async {
      final s = FakeScheduleSource()
        ..mine[Ministry.media] = [
          event(Ministry.media, 1, DateTime(2026, 11, 17), [assignment(1, ivan, role(1, 'Звук'))]),
          event(Ministry.media, 2, DateTime(2026, 11, 18), [assignment(2, ivan, role(1, 'Звук'))]),
        ];
      final c = _make(s);
      await c.loadMine();
      expect(c.agenda.single.date.day, 18);
    });

    test('403 убирает служение, а не показывает ошибку', () async {
      final s = FakeScheduleSource()
        ..denied.add(Ministry.media)
        ..mine[Ministry.music] = [event(Ministry.music, 1, _sunday, [assignment(1, ivan, role(1, 'Гитара'))])];
      final c = _make(s);
      await c.loadMine();
      expect(c.ministries, [Ministry.music, Ministry.sunday]);
      expect(c.failedMinistries, isEmpty);
      expect(c.agenda.length, 1);
    });

    test('сбой одного служения не прячет остальные', () async {
      final s = FakeScheduleSource()
        ..failing.add(Ministry.music)
        ..mine[Ministry.media] = [event(Ministry.media, 1, _sunday, [assignment(1, ivan, role(1, 'Звук'))])];
      final c = _make(s);
      await c.loadMine();
      expect(c.failedMinistries, {Ministry.music});
      expect(c.agenda.length, 1);
    });

    test('копия без сети помечается временем', () async {
      final saved = DateTime(2026, 11, 17, 8);
      final s = FakeScheduleSource()..staleSince = saved;
      final c = _make(s);
      await c.loadMine();
      expect(c.staleSince, saved);
    });

    test('ответ показывается сразу, при ошибке сети откатывается', () async {
      final s = FakeScheduleSource()..mine[Ministry.media] = [event(Ministry.media, 1, _sunday, [assignment(9, ivan, role(1, 'Звук'))])];
      final c = _make(s);
      await c.loadMine();

      await c.answer(c.agenda.single, AssignmentStatus.confirmed);
      expect(c.agenda.single.status, AssignmentStatus.confirmed);
      expect(s.statusCalls.single, (Ministry.media, 9, AssignmentStatus.confirmed));

      s.statusFails = true;
      await expectLater(c.answer(c.agenda.single, AssignmentStatus.declined), throwsException);
      expect(c.agenda.single.status, AssignmentStatus.confirmed, reason: 'откат на прежний ответ');
    });

    test('«подтвердить все» сообщает, сколько ответов не ушло', () async {
      final s = FakeScheduleSource()
        ..mine[Ministry.media] = [
          event(Ministry.media, 1, _sunday, [assignment(1, ivan, role(1, 'Звук')), assignment(2, ivan, role(2, 'Камера'))]),
        ];
      final c = _make(s);
      await c.loadMine();
      s.statusFails = true;
      expect(await c.confirmAllPending(), 2);
      expect(c.pending.length, 2);
      s.statusFails = false;
      expect(await c.confirmAllPending(), 0);
      expect(c.pending, isEmpty);
    });

    test('воскресное назначение отвечать не просит', () async {
      final s = FakeScheduleSource()..mineSunday = [SundayPlan(id: 3, date: _sunday, startTime: '11:00', published: true, leader: ivan)];
      final c = _make(s);
      await c.loadMine();
      expect(c.agenda.single.canAnswer, isFalse);
      expect(c.pending, isEmpty);
    });
  });

  group('команда', () {
    test('неделя считается с понедельника, листается и возвращается к текущей', () async {
      final s = FakeScheduleSource();
      final c = _make(s);
      await c.loadTeam();
      expect(s.eventRanges.last.$1, DateTime(2026, 11, 16));
      expect(s.eventRanges.last.$2, DateTime(2026, 11, 22));
      expect(c.isThisWeek, isTrue);

      await c.shiftWeek(1);
      expect(c.weekStart, DateTime(2026, 11, 23));
      expect(c.isThisWeek, isFalse);

      await c.goToThisWeek();
      expect(c.isThisWeek, isTrue);
    });

    test('воскресенье — это конец недели, а не начало следующей', () {
      expect(mondayOf(DateTime(2026, 11, 22)), DateTime(2026, 11, 16));
      expect(mondayOf(DateTime(2026, 11, 23)), DateTime(2026, 11, 23));
    });

    test('при ошибке — понятное сообщение; повтор загружает', () async {
      final s = FakeScheduleSource()..failing.add(Ministry.media);
      final c = _make(s);
      await c.loadTeam();
      expect(c.teamError, contains('Не удалось'));
      s.failing.clear();
      await c.loadTeam();
      expect(c.teamError, isNull);
    });

    test('403 на выбранном служении переключает на следующее', () async {
      final s = FakeScheduleSource()..denied.add(Ministry.media);
      final c = _make(s);
      await c.loadTeam();
      expect(c.teamMinistry, Ministry.music);
      expect(c.ministries, [Ministry.music, Ministry.sunday]);
    });

    test('смена служения грузит его события', () async {
      final s = FakeScheduleSource()
        ..team[Ministry.music] = [event(Ministry.music, 7, _sunday, [assignment(1, maria, role(3, 'Вокал'))])]
        ..teamSunday = [SundayPlan(id: 8, date: _sunday, startTime: '11:00', published: true, leader: ivan)];
      final c = _make(s);
      await c.selectMinistry(Ministry.music);
      expect(c.teamEvents.single.planId, 7);
      await c.selectMinistry(Ministry.sunday);
      expect(c.teamSunday.single.id, 8);
      expect(c.teamEvents, isEmpty);
    });

    test('назначить: запрос с нужными id и перезагрузка недели', () async {
      final s = FakeScheduleSource();
      final c = _make(s);
      final ev = event(Ministry.media, 55, _sunday, const []);
      await c.assign(ev, role(2, 'Камера'), maria);
      expect(s.assignCalls.single, (55, 2, 2));
      expect(s.eventRanges, isNotEmpty);
    });

    test('ошибка назначения (роль занята) уходит наверх', () async {
      final s = FakeScheduleSource()..assignFails = true;
      final c = _make(s);
      await expectLater(c.assign(event(Ministry.media, 1, _sunday, const []), role(1, 'Звук'), ivan), throwsException);
    });

    test('снять назначение убирает строку сразу', () async {
      final a = assignment(4, maria, role(1, 'Звук'));
      final s = FakeScheduleSource()..team[Ministry.media] = [event(Ministry.media, 1, _sunday, [a])];
      final c = _make(s);
      await c.loadTeam();
      await c.unassign(c.teamEvents.single, a);
      expect(s.removed, [4]);
      expect(c.teamEvents.single.assignments, isEmpty);
    });

    test('воскресенье: меняем только то поле, которое выбрали', () async {
      final s = FakeScheduleSource();
      final c = _make(s);
      final plan = SundayPlan(id: 0, date: _sunday, startTime: '11:00', published: false);
      await c.setSunday(plan, preacher: true, person: maria);
      await c.setSunday(plan, leader: true);
      expect(s.sundaySaves[0], {'plan': 0, 'setLeader': false, 'leader': null, 'setPreacher': true, 'preacher': 2});
      expect(s.sundaySaves[1], {'plan': 0, 'setLeader': true, 'leader': null, 'setPreacher': false, 'preacher': null}, reason: 'снятие ведущего');
    });
  });
}
