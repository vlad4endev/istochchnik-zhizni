import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/prayer/logic/prayer_logic.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';

Map<String, dynamic> member(int id, String name, {String need = '', String? first, String? last, Object? cycle}) => {
      'id': id,
      'name': name,
      'first_name': first,
      'last_name': last,
      'prayer_request': need,
      'in_prayer_cycle': ?cycle,
    };

void main() {
  group('rosterName («Фамилия Имя»)', () {
    test('колонки главнее поля name', () {
      expect(rosterName(name: 'x', first: 'Иван', last: 'Петров'), 'Петров Иван');
    });
    test('два слова в name — «Имя Фамилия»', () {
      expect(rosterName(name: 'Иван Петров'), 'Петров Иван');
    });
    test('три слова — первое фамилия', () {
      expect(rosterName(name: 'Петров Иван Сергеевич'), 'Петров Иван Сергеевич');
    });
    test('одна колонка добирается из name', () {
      expect(rosterName(name: 'Иван Петров', first: 'Иван'), 'Петров Иван');
    });
    test('пусто — #id', () {
      expect(rosterName(name: '', id: 7), '#7');
    });
  });

  group('заметки координатора', () {
    test('пустой текст — заметки нет', () {
      final notes = CoordinatorNotes.fromJson({
        'urgent_prayer': {'text': '  ', 'start_date': '2026-11-21', 'end_date': '2026-11-21'},
        'announcement': {'text': 'Собрание в 18:00', 'start_date': '2026-11-21', 'end_date': '2026-11-22'},
      });
      expect(notes.urgent, isNull);
      expect(notes.announcement!.text, 'Собрание в 18:00');
    });

    test('срок: сегодня / до конца недели / до конца месяца', () {
      DateTime d(int m, int day) => DateTime(2026, m, day);
      expect(CoordinatorNote(text: 'a', start: d(11, 18), end: d(11, 18)).duration, NoteDuration.day);
      // 18 ноября 2026 — среда, воскресенье той недели — 22 ноября
      expect(CoordinatorNote(text: 'a', start: d(11, 18), end: d(11, 22)).duration, NoteDuration.week);
      expect(CoordinatorNote(text: 'a', start: d(11, 18), end: d(11, 30)).duration, NoteDuration.month);
      expect(CoordinatorNote(text: 'a', start: d(11, 18), end: d(11, 25)).duration, NoteDuration.day);
    });

    test('мусор вместо даты не даёт дат и срок «сегодня»', () {
      final note = CoordinatorNote.tryParse({
        'text': 'Привет',
        'start_date': 'Sat Nov 21 2026 00:00:00 GMT+0300',
        'end_date': 'Sun Nov 22 2026 00:00:00 GMT+0300',
      })!;
      expect(note.start, isNull);
      expect(note.duration, NoteDuration.day);
    });
  });

  group('план недели', () {
    test('разбор дней, участников и «вне цикла»', () {
      final days = WeekDay.parseList({
        'days': [
          {'date': '2026-11-23', 'member': member(1, 'Иван Петров', need: ' Здоровье ')},
          {'date': '2026-11-24', 'member': null},
          {'date': 'мусор', 'member': member(2, 'Х')},
          {'date': '2026-11-25', 'member': member(3, 'Анна Орлова', cycle: false)},
        ],
      });
      expect(days.length, 3);
      expect(days[0].member!.prayerRequest, 'Здоровье');
      expect(days[0].member!.hasNeed, isTrue);
      expect(days[1].member, isNull);
      expect(days[2].member!.inCycle, isFalse);
      expect(days[0].ymd, '2026-11-23');
    });

    test('куратор: свободен / занят', () {
      final claims = Claims.fromJson({
        'coordinators': [
          {'id': 5, 'name': 'Мария Лис'},
        ],
        'members': [
          {'id': 1, 'name': 'A', 'claimed_by': null, 'can_toggle': true},
          {'id': 2, 'name': 'B', 'claimed_by': {'id': 5, 'name': 'Мария Лис'}, 'can_toggle': false},
        ],
      });
      expect(claims.coordinators.single.displayName, 'Лис Мария');
      expect(claims.of(1)!.claimedBy, isNull);
      expect(claims.of(2)!.claimedBy!.id, 5);
      expect(claims.of(99), isNull);
    });
  });

  group('отпавшие, зрители, именинники', () {
    test('отпавшие: пустые имена пропускаются', () {
      final list = Backslider.parseList([
        {'id': 1, 'name': ' Пётр '},
        {'id': 2, 'name': ''},
      ]);
      expect(list.map((b) => b.name), ['Пётр']);
    });

    test('зрители: счётчик берётся из списка, если сервер не прислал', () {
      final v = ViewersToday.fromJson({
        'viewers': [
          {'member_id': 3, 'name': 'Иван Петров', 'first_seen_at': '2026-11-21T08:30:00Z'},
        ],
      });
      expect(v.count, 1);
      expect(v.viewers.single.person.displayName, 'Петров Иван');
    });

    test('именинники: без даты или имени не берём', () {
      final list = Birthday.parseList({
        'items': [
          {'id': 1, 'name': 'Анна', 'week_date': '2026-11-22'},
          {'id': 2, 'name': '', 'week_date': '2026-11-22'},
          {'id': 3, 'name': 'Пётр', 'week_date': 'x'},
        ],
      });
      expect(list.single.name, 'Анна');
    });
  });

  group('фильтры очереди', () {
    final days = WeekDay.parseList({
      'days': [
        {'date': '2026-11-23', 'member': member(1, 'Иван Петров', need: 'Здоровье')},
        {'date': '2026-11-24', 'member': member(2, 'Анна Орлова')},
        {'date': '2026-11-25', 'member': member(3, 'Олег Ким')},
        {'date': '2026-11-26', 'member': null},
      ],
    });
    final claims = Claims.fromJson({
      'members': [
        {'id': 1, 'name': 'a', 'claimed_by': {'id': 9, 'name': 'Я'}},
        {'id': 2, 'name': 'b', 'claimed_by': {'id': 5, 'name': 'Мария'}},
        {'id': 3, 'name': 'c', 'claimed_by': null},
      ],
    });
    List<int> ids(List<WeekDay> l) => [for (final d in l) d.member?.id ?? 0];

    test('статистика', () {
      final s = statsFor(days, claims, 9);
      expect((s.days, s.filled, s.empty, s.free, s.mine, s.busy), (4, 1, 2, 1, 1, 1));
      expect(s.progress, closeTo(1 / 3, 1e-9));
    });

    test('каждый фильтр', () {
      List<int> f(CollectionFilter x) => ids(filterDays(days, claims, 9, filter: x));
      expect(f(CollectionFilter.all), [1, 2, 3, 0]);
      expect(f(CollectionFilter.needEmpty), [2, 3]);
      expect(f(CollectionFilter.needFilled), [1]);
      expect(f(CollectionFilter.curatorFree), [3]);
      expect(f(CollectionFilter.curatorMine), [1]);
      expect(f(CollectionFilter.curatorBusy), [2]);
    });

    test('поиск по имени без учёта регистра, дни без участника исчезают', () {
      expect(ids(filterDays(days, claims, 9, query: 'орлов')), [2]);
      expect(ids(filterDays(days, claims, 9, query: 'ЗЗЗ')), isEmpty);
    });

    test('без отметок сбора куратор-фильтры не прячут всё', () {
      final shown = filterDays(days, Claims.empty, 9, filter: CollectionFilter.curatorMine, claimsOk: false);
      expect(shown.length, 4);
    });

    test('«ваши участники» и «не заполнено» для админа', () {
      expect(ids(assignedTo(days, claims, 9)), [1]);
      expect(ids(unfilledFrom(days, '2026-11-24')), [2, 3]);
      expect(ids(unfilledFrom(days, '2026-11-25')), [3]);
    });

    test('участник вне цикла в «не заполнено» не попадает', () {
      final off = WeekDay.parseList({
        'days': [
          {'date': '2026-11-23', 'member': member(1, 'Иван Петров', cycle: false)},
        ],
      });
      expect(unfilledFrom(off, '2026-11-23'), isEmpty);
    });
  });
}
