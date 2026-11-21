import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:molitva/features/home/logic/home_logic.dart';
import 'package:molitva/features/home/models/home_models.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/service/models/plan_models.dart';

PlanSummary plan(int id, DateTime date, String start, {int minutes = 90}) =>
    PlanSummary(id: id, date: date, startTime: start, published: true, blocksCount: 3, totalMinutes: minutes);

PlanBlock block(Map<String, dynamic> content) => PlanBlock(id: 1, order: 1, title: 't', durationMinutes: 10, kind: BlockKind.sermon, content: content);

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('фаза служения', () {
    final p = plan(1, DateTime(2026, 11, 22), '10:00', minutes: 90); // 10:00–11:30, отзывы до 16:30
    test('до начала → идёт → окно отзывов → закрыто', () {
      expect(planPhase(p, DateTime(2026, 11, 22, 9, 59)), ServicePhase.upcoming);
      expect(planPhase(p, DateTime(2026, 11, 22, 10)), ServicePhase.live);
      expect(planPhase(p, DateTime(2026, 11, 22, 11, 30)), ServicePhase.live);
      expect(planPhase(p, DateTime(2026, 11, 22, 11, 31)), ServicePhase.feedback);
      expect(planPhase(p, DateTime(2026, 11, 22, 16, 30)), ServicePhase.feedback);
      expect(planPhase(p, DateTime(2026, 11, 22, 16, 31)), ServicePhase.closed);
    });
    test('без времени начала служение «закрыто» и не выбирается', () {
      final noTime = plan(2, DateTime(2026, 11, 22), '');
      expect(planPhase(noTime, DateTime(2026, 11, 22, 9)), ServicePhase.closed);
      expect(pickNearestPlan([noTime], DateTime(2026, 11, 22, 9)), isNull);
    });
  });

  group('ближайшее служение', () {
    final now = DateTime(2026, 11, 22, 12); // воскресенье, полдень
    test('идущее или в окне отзывов важнее будущего; из них берётся самое позднее по старту', () {
      final past = plan(1, DateTime(2026, 11, 22), '10:00'); // отзывы
      final later = plan(2, DateTime(2026, 11, 22), '11:00', minutes: 120); // идёт до 13:00
      final future = plan(3, DateTime(2026, 11, 29), '10:00');
      expect(pickNearestPlan([past, later, future], now)!.id, 2);
      expect(pickNearestPlan([past, future], now)!.id, 1);
    });
    test('иначе — ближайшее будущее; ничего нет — null', () {
      final a = plan(1, DateTime(2026, 12, 6), '10:00');
      final b = plan(2, DateTime(2026, 11, 29), '10:00');
      expect(pickNearestPlan([a, b], now)!.id, 2);
      expect(pickNearestPlan([plan(9, DateTime(2026, 11, 1), '10:00')], now), isNull);
      expect(pickNearestPlan(const [], now), isNull);
    });
  });

  group('проповедь', () {
    test('берётся первый блок, где заполнены и тема, и стих', () {
      final s = sermonOf([
        block({'sermon_topic': 'Только тема'}),
        block({'sermon_topic': ' Вера и язык ', 'sermon_scripture': ' Иак. 3:1-12 '}),
      ]);
      expect((s!.topic, s.scripture), ('Вера и язык', 'Иак. 3:1-12'));
      expect(sermonOf([block({}), block({'sermon_scripture': 'Ин 3:16'})]), isNull);
    });
    test('подписи: дата, заголовок в ёлочках, резюме', () {
      expect(serviceDateLabel(DateTime(2026, 11, 22)), 'Вск, 22 ноября 2026');
      expect(serviceDateLabel(DateTime(2026, 11, 23)), 'Пн, 23 ноября 2026');
      expect(sermonTitle('Вера и язык'), '«Вера и язык»');
      expect(sermonTitle('«Уже в кавычках»'), '«Уже в кавычках»');
      expect(sermonSummary('Михаил Самодуров', '«Вера и язык»'), 'Михаил Самодуров - Вера и язык');
    });
    test('инициалы', () {
      expect(const ServicePerson(id: 1, name: 'Михаил Самодуров').initials, 'МС');
      expect(const ServicePerson(id: 1, name: 'Дмитрий').initials, 'Д');
      expect(const ServicePerson(id: 1, name: '  ').initials, 'П');
    });
  });

  group('мероприятия', () {
    final now = DateTime(2026, 11, 22, 12); // воскресенье
    Map<String, dynamic> once(String date, String time, String title) =>
        {'title': title, 'event_date': date, 'event_time': time, 'recurrence_type': 'once', 'is_active': true};

    test('сегодня → завтра → неделя → любое будущее', () {
      expect(pickUpcomingEvent(now, [once('2026-11-24', '19:00', 'Вторник'), once('2026-11-22', '18:00', 'Сегодня')]).whenLabel, 'Сегодня в 18:00');
      expect(pickUpcomingEvent(now, [once('2026-11-23', '19:00', 'Завтра')]).whenLabel, 'Завтра в 19:00');
      expect(pickUpcomingEvent(now, [once('2026-11-26', '19:00', 'Чт')]).whenLabel, 'четверг в 19:00');
      expect(pickUpcomingEvent(now, [once('2026-12-20', '19:00', 'Далеко')]).title, 'Далеко');
    });
    test('еженедельное: ближайший нужный день недели', () {
      final e = {'title': 'Молодёжка', 'event_time': '19:00', 'recurrence_type': 'weekly', 'weekly_day': 5, 'is_active': true}; // пятница
      final picked = pickUpcomingEvent(now, [e]);
      expect(picked.whenLabel, 'пятница в 19:00');
    });
    test('неактивные пропускаются, пусто — заглушка', () {
      final inactive = {...once('2026-11-23', '19:00', 'Скрыто'), 'is_active': false};
      final empty = pickUpcomingEvent(now, [inactive]);
      expect(empty.isPlaceholder, isTrue);
      expect(empty.title, 'Мероприятий пока нет');
    });
    test('пустое описание и название получают подстановки; афиша', () {
      final e = pickUpcomingEvent(now, [
        {'event_date': '2026-11-22', 'event_time': '20:00', 'recurrence_type': 'once', 'poster_url': '/uploads/a.jpg'},
      ]);
      expect(e.title, 'Событие');
      expect(e.description, 'Подробное описание скоро появится.');
      expect(e.posterUrl, '/uploads/a.jpg');
    });
  });

  group('трансляция', () {
    final start = DateTime(2026, 11, 22, 10);
    BroadcastInfo b(String status, {DateTime? at, String stream = ''}) =>
        BroadcastInfo(status: status, title: 'Служение', startsAt: at ?? start, streamUrl: stream);

    test('режимы', () {
      expect(broadcastMode(start, null), BroadcastMode.hidden);
      expect(broadcastMode(start, b('finished')), BroadcastMode.hidden);
      expect(broadcastMode(start.subtract(const Duration(minutes: 5)), b('scheduled')), BroadcastMode.pre);
      expect(broadcastMode(start.add(const Duration(minutes: 5)), b('scheduled', stream: 'https://x')), BroadcastMode.onAir);
      expect(broadcastMode(start.add(const Duration(minutes: 5)), b('scheduled')), BroadcastMode.pre, reason: 'без ссылки эфира нет');
      expect(broadcastMode(start.add(const Duration(minutes: 5)), b('live')), BroadcastMode.onAir);
      expect(broadcastMode(start.add(const Duration(hours: 3)), b('live')), BroadcastMode.post);
    });
    test('виджет: в эфире или за два часа до начала', () {
      expect(showBroadcast(start.subtract(const Duration(hours: 3)), b('scheduled')), isFalse);
      expect(showBroadcast(start.subtract(const Duration(hours: 1)), b('scheduled')), isTrue);
      expect(showBroadcast(start.add(const Duration(minutes: 1)), b('live')), isTrue);
      expect(showBroadcast(start.add(const Duration(hours: 5)), b('live')), isFalse);
    });
    test('таймер: до начала и «идёт эфир»', () {
      expect(broadcastTimer(start.subtract(const Duration(minutes: 42, seconds: 10)), b('scheduled')), '00:42:10');
      expect(broadcastTimer(start.add(const Duration(hours: 1, minutes: 2, seconds: 3)), b('live')), '01:02:03');
      expect(broadcastTimer(start.add(const Duration(hours: 5)), b('live')), '—');
      expect(broadcastTimer(start, null), '—');
    });
    test('начало эфира читается как локальное «настенное» время', () {
      final info = BroadcastInfo.tryParse({'status': 'live', 'title': 'X', 'starts_at': '2026-11-22 10:00:00', 'platform': 'YouTube'})!;
      expect(info.startsAt, DateTime(2026, 11, 22, 10));
      expect(broadcastPlatform(info.platform), 'YouTube');
      expect(broadcastPlatform('other'), 'Платформа');
      expect(BroadcastInfo.tryParse({}), isNull);
    });
  });

  group('подкаст', () {
    test('самый свежий выпуск', () {
      final list = Episode.parseList({
        'episodes': [
          {'title': 'Старый', 'audioUrl': 'a', 'pubDate': '2026-11-01T10:00:00Z'},
          {'title': 'Новый', 'audioUrl': 'b', 'pubDate': '2026-11-15T10:00:00Z'},
          {'title': 'Без даты', 'audioUrl': 'c'},
        ],
      });
      expect(latestEpisode(list)!.title, 'Новый');
      expect(latestEpisode(const []), isNull);
    });
  });

  group('«Молимся сегодня»', () {
    test('подпись дня', () => expect(todayPrayerLabel(DateTime(2026, 11, 22)), 'Сегодня воскресенье, 22 ноября'));
  });

  group('моя неделя служения', () {
    final sunday = DateTime(2026, 11, 22);
    ScheduleEvent event(Ministry m, int plan, List<ScheduleAssignment> a, {DateTime? date}) =>
        ScheduleEvent(ministry: m, planId: plan, title: 'Воскресное богослужение', date: date ?? sunday, startTime: '10:00', assignments: a);
    ScheduleAssignment assignment(int id, String role, AssignmentStatus s, {int member = 9}) => ScheduleAssignment(
          id: id,
          memberId: member,
          memberName: 'Я',
          role: ScheduleRole(id: id, name: role, color: parseHexColor('#112233')),
          status: s,
        );

    test('несколько позиций одного собрания — одна карточка; статусы агрегируются', () {
      final cards = buildMyService(
        sunday: sunday,
        memberId: 9,
        music: [
          event(Ministry.music, 5, [assignment(1, 'Гитара', AssignmentStatus.confirmed), assignment(2, 'Вокал', AssignmentStatus.pending)]),
        ],
      );
      expect(cards.length, 1);
      expect(cards.single.roles.map((r) => r.roleName), ['Гитара', 'Вокал']);
      expect(cards.single.status, AssignmentStatus.pending);
      expect(cards.single.pending.map((r) => r.assignmentId), [2]);
    });

    test('дубли назначения и чужие дни не попадают', () {
      final dup = assignment(1, 'Гитара', AssignmentStatus.confirmed);
      final cards = buildMyService(
        sunday: sunday,
        memberId: 9,
        music: [
          event(Ministry.music, 5, [dup, dup]),
          event(Ministry.music, 6, [assignment(7, 'Бас', AssignmentStatus.confirmed)], date: DateTime(2026, 11, 29)),
        ],
      );
      expect(cards.single.roles.length, 1);
    });

    test('чужое назначение в ответе игнорируется', () {
      final cards = buildMyService(
        sunday: sunday,
        memberId: 9,
        media: [event(Ministry.media, 5, [assignment(1, 'Звук', AssignmentStatus.assigned, member: 77)])],
      );
      expect(cards, isEmpty);
    });

    test('статус: отказ и подтверждение', () {
      MyServiceCard c(List<AssignmentStatus> s) => MyServiceCard(
            key: 'k',
            ministry: ServiceMinistry.media,
            date: sunday,
            startTime: '10:00',
            eventTitle: 't',
            roles: [for (final x in s) MyRole(roleName: 'r', color: parseHexColor('#000000'), status: x, assignmentId: 1)],
          );
      expect(c([AssignmentStatus.confirmed, AssignmentStatus.declined]).status, AssignmentStatus.declined);
      expect(c([AssignmentStatus.confirmed, AssignmentStatus.confirmed]).status, AssignmentStatus.confirmed);
    });

    test('воскресное собрание: ведущий / проповедник, порядок карточек', () {
      final plan = SundayPlan(
        id: 3,
        date: sunday,
        startTime: '10:00',
        published: true,
        leader: const PersonRef(id: 9, name: 'Я'),
        preacher: const PersonRef(id: 4, name: 'Другой'),
      );
      final cards = buildMyService(
        sunday: sunday,
        memberId: 9,
        sundayPlans: [plan],
        music: [event(Ministry.music, 5, [assignment(1, 'Гитара', AssignmentStatus.confirmed)])],
      );
      expect(cards.map((c) => c.ministry), [ServiceMinistry.sunday, ServiceMinistry.music]);
      expect(cards.first.roles.single.roleName, 'Ведущий');
      expect(cards.first.hasStatus, isFalse);
      final preacher = buildMyService(sunday: sunday, memberId: 4, sundayPlans: [plan]);
      expect(preacher.single.roles.single.roleName, 'Проповедник');
    });

    test('опорное воскресенье: дата служения или ближайшее воскресенье', () {
      expect(anchorSunday(DateTime(2026, 11, 22), DateTime(2026, 11, 18)), DateTime(2026, 11, 22));
      expect(anchorSunday(null, DateTime(2026, 11, 18)), DateTime(2026, 11, 22));
      expect(anchorSunday(null, DateTime(2026, 11, 22)), DateTime(2026, 11, 22));
    });
  });
}
