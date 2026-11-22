import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/home/home_page.dart';
import 'package:molitva/features/home/models/home_models.dart';
import 'package:molitva/features/prayer/data/prayer_source.dart' show WeekKind;
import 'package:molitva/features/prayer/models/prayer_models.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../prayer/fake_prayer.dart';
import 'fake_home.dart';

SessionController _session({String role = 'member', bool coordinator = false, int id = 9}) {
  final s = SessionController();
  s.user = AppUser(
    id: id,
    name: 'Мария Лис',
    firstName: 'Мария',
    lastName: 'Лис',
    role: role,
    roles: [role],
    registrationStatus: 'active',
    isCollectionCoordinator: coordinator,
  );
  return s;
}

DateTime _today() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

DateTime _sunday() {
  final t = _today();
  return t.add(Duration(days: (7 - t.weekday % 7) % 7));
}

String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

Widget _app(
  FakeHome home,
  FakePrayer prayer,
  SessionController session, {
  FakeSchedule? schedule,
  double scale = 1,
  double width = 360,
  double height = 4000,
  Brightness brightness = Brightness.light,
}) =>
    ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        theme: churchTheme(brightness: brightness),
        home: MediaQuery(
          data: MediaQueryData(size: Size(width, height), textScaler: TextScaler.linear(scale)),
          child: HomePage(key: UniqueKey(), homeSource: home, scheduleSource: schedule ?? FakeSchedule(), prayerSource: prayer),
        ),
      ),
    );

/// Высокий экран: ленивый список строит всё сразу, а проверки видят весь порядок секций.
void _size(WidgetTester tester, {double width = 360, double height = 4000}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

PlanSummary _plan({DateTime? date, String start = '10:00', int preacher = 7, int? leader = 8}) => PlanSummary(
      id: 1,
      date: date ?? _sunday(),
      startTime: start,
      published: true,
      blocksCount: 3,
      totalMinutes: 90,
      preacherId: preacher,
      leaderId: leader,
      shareToken: 'TOKEN',
    );

FakeHome _home({PlanSummary? plan}) => FakeHome()
  ..plansNow = [plan ?? _plan()]
  ..blocks = {
    1: const [
      PlanBlock(
        id: 1,
        order: 1,
        title: 'Проповедь',
        durationMinutes: 30,
        kind: BlockKind.sermon,
        content: {'sermon_topic': 'Вера и язык', 'sermon_scripture': 'Иак. 3:1-12'},
      ),
    ],
  }
  ..people = {
    7: const ServicePerson(id: 7, name: 'Михаил Самодуров'),
    8: const ServicePerson(id: 8, name: 'Дмитрий Сорокин'),
  }
  ..eventsNow = [
    {
      'title': 'Молодёжная встреча',
      'description': 'Общение, игры и чай после собрания.',
      'event_date': _ymd(_today()),
      'event_time': '23:30',
      'recurrence_type': 'once',
      'is_active': true,
    },
  ]
  ..episodesNow = [const Episode(title: 'Уверенность в Божьем спасении | Александр Харлашкин', audioUrl: 'https://x/a.mp3')];

FakePrayer _prayer() => FakePrayer()
  ..notesNow = const CoordinatorNotes(
    urgent: CoordinatorNote(text: 'Помолитесь за семью Ивана'),
    announcement: CoordinatorNote(text: 'В субботу общее собрание в 18:00'),
  )
  ..birthdaysNow = [
    Birthday(id: 1, name: 'Анна Орлова', date: _today()),
    Birthday(id: 2, name: 'Пётр Сидоров', date: _today().add(const Duration(days: 1))),
    Birthday(id: 3, name: 'Далёкий Именинник', date: _today().add(const Duration(days: 10))),
  ];

double _top(WidgetTester tester, Finder f) => tester.getTopLeft(f.first).dy;

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('состав главной как на сайте', () {
    testWidgets('сверху три кнопки в один ряд — без плиток Библии, Песенника и Трансляции', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      final labels = ['Мероприятия', 'Отправить нужду', 'Проповеди'];
      final tops = [for (final l in labels) _top(tester, find.widgetWithText(InkWell, l))];
      expect(tops.toSet().length, 1, reason: 'все три на одной линии');
      for (final gone in ['Библия', 'Песенник', 'Трансляция', 'Моя нужда']) {
        expect(find.text(gone), findsNothing, reason: gone);
      }
      expect(find.text('Главная'), findsOneWidget);
    });

    testWidgets('прихожанин: без «Отправить нужду», без объявления и «Молимся сегодня»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session(role: 'parishioner')));
      await tester.pumpAndSettle();
      expect(find.text('Отправить нужду'), findsNothing);
      expect(find.text('Мероприятия'), findsWidgets);
      expect(find.text('Молимся сегодня'), findsNothing);
      expect(find.text('Помолитесь за семью Ивана'), findsNothing);
      expect(find.text('В субботу общее собрание в 18:00'), findsNothing);
    });

    testWidgets('порядок секций: кнопки → дни рождения → Богослужение → объявление → Молимся → Медиа → Мероприятия', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      final order = [
        find.widgetWithText(InkWell, 'Проповеди'),
        find.text('ДНИ РОЖДЕНИЯ'),
        find.text('БОГОСЛУЖЕНИЕ'),
        find.text('В субботу общее собрание в 18:00'),
        find.text('Молимся сегодня'),
        find.text('Медиа'),
        find.text('Молодёжная встреча'),
      ];
      final tops = [for (final f in order) _top(tester, f)];
      for (var i = 1; i < tops.length; i++) {
        expect(tops[i], greaterThan(tops[i - 1]), reason: 'секция $i ниже секции ${i - 1}');
      }
    });
  });

  group('карточка «Богослужение»', () {
    testWidgets('проповедник и ведущий, тема, стих и резюме', (tester) async {
      _size(tester);
      // Служение — «ещё не прошло» в любой день недели: в воскресенье после 10:00 прежнее время давало «Оценить…».
      await tester.pumpWidget(_app(_home(plan: _plan(start: '23:59')), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('ПРОПОВЕДНИК'), findsOneWidget);
      expect(find.text('Михаил Самодуров'), findsOneWidget);
      expect(find.text('МС'), findsOneWidget, reason: 'инициалы вместо фото');
      expect(find.text('Проповеди'), findsWidgets);
      expect(find.text('ВЕДУЩИЙ'), findsOneWidget);
      expect(find.text('Дмитрий Сорокин'), findsOneWidget);
      expect(find.text('«Вера и язык»'), findsOneWidget);
      expect(find.text('Иак. 3:1-12'), findsOneWidget);
      expect(find.text('Михаил Самодуров - Вера и язык'), findsOneWidget);
      expect(find.text('Оценить и оставить комментарий'), findsNothing, reason: 'служение ещё не прошло');
    });

    testWidgets('дата в шапке — день недели, число, месяц, год', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      final sunday = _sunday();
      expect(find.textContaining('${sunday.day} '), findsWidgets);
      expect(find.textContaining('${sunday.year}'), findsWidgets);
    });

    testWidgets('кнопки «написать» у проповедника и ведущего; у себя — нет', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      // Две кнопки в карточке служения и по одной у двух именинников недели.
      expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsNWidgets(2 + 2));
    });

    testWidgets('я сам проповедник — кнопка «написать» только у ведущего', (tester) async {
      _size(tester);
      final prayer = _prayer()..birthdaysNow = const [];
      await tester.pumpWidget(_app(_home(), prayer, _session(id: 7)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsOneWidget);
    });

    testWidgets('после служения: «Оценить и оставить комментарий»', (tester) async {
      _size(tester);
      // Служение было сегодня утром и закончилось, но окно отзывов ещё открыто.
      final now = DateTime.now();
      final start = now.subtract(const Duration(hours: 3));
      final plan = PlanSummary(
        id: 1,
        date: DateTime(start.year, start.month, start.day),
        startTime: '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}',
        published: true,
        blocksCount: 3,
        totalMinutes: 30,
        preacherId: 7,
        leaderId: 8,
        shareToken: 'TOKEN',
      );
      // Полночь: «3 часа назад» может оказаться вчера — тогда окно уже закрыто, проверять нечего.
      if (start.day != now.day) return;
      await tester.pumpWidget(_app(_home(plan: plan), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Оценить и оставить комментарий'), findsOneWidget);
    });

    testWidgets('нет ведущего — карточка только с проповедником; нет проповеди — карточки нет', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(plan: _plan(leader: null)), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('ВЕДУЩИЙ'), findsNothing);
      expect(find.text('ПРОПОВЕДНИК'), findsOneWidget);

      final empty = _home()..blocks = {1: const []};
      await tester.pumpWidget(_app(empty, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('БОГОСЛУЖЕНИЕ'), findsNothing);
    });
  });

  group('«Молимся сегодня»', () {
    testWidgets('показывает день и за кого молимся; тап открывает «Молитву»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Молимся сегодня'), findsOneWidget);
      expect(find.text('Молимся за Эдуард Толстошеин'), findsOneWidget);
      expect(find.textContaining('Сегодня '), findsWidgets);
    });

    testWidgets('в цикле никто не назначен — так и пишем', (tester) async {
      _size(tester);
      final home = _home()..dayNow = {};
      await tester.pumpWidget(_app(home, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Сегодня в цикле участник не назначен'), findsOneWidget);
    });
  });

  group('трансляция, «Медиа», «Мероприятия»', () {
    testWidgets('идёт эфир: карточка с «В эфире», таймером и «Смотреть»', (tester) async {
      _size(tester);
      final home = _home()
        ..broadcastNow = BroadcastInfo(status: 'live', title: 'Воскресное служение', startsAt: DateTime.now().subtract(const Duration(minutes: 10)), platform: 'youtube');
      await tester.pumpWidget(_app(home, _prayer(), _session()));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Воскресное служение'), findsOneWidget);
      expect(find.text('В эфире'), findsOneWidget);
      expect(find.text('YouTube'), findsOneWidget);
      expect(find.text('Идёт трансляция'), findsOneWidget);
      expect(find.text('Смотреть'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('эфира нет — карточки нет', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Смотреть'), findsNothing);
    });

    testWidgets('до начала больше двух часов — карточки нет, за час — «Скоро» и «До начала»', (tester) async {
      _size(tester);
      final far = _home()..broadcastNow = BroadcastInfo(status: 'scheduled', title: 'Далеко', startsAt: DateTime.now().add(const Duration(hours: 5)));
      await tester.pumpWidget(_app(far, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Далеко'), findsNothing);

      final soon = _home()..broadcastNow = BroadcastInfo(status: 'scheduled', title: 'Скоро эфир', startsAt: DateTime.now().add(const Duration(minutes: 50)));
      await tester.pumpWidget(_app(soon, _prayer(), _session()));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Скоро эфир'), findsOneWidget);
      expect(find.text('Скоро'), findsOneWidget);
      expect(find.text('До начала'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('«Медиа»: последняя проповедь и «Воспроизвести»; нет выпусков — подсказка', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Уверенность в Божьем спасении | Александр Харлашкин'), findsOneWidget);
      expect(find.text('Воспроизвести'), findsOneWidget);

      final none = _home()..episodesNow = const [];
      await tester.pumpWidget(_app(none, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Новая проповедь пока не найдена.'), findsOneWidget);
      expect(find.text('Воспроизвести'), findsNothing);
    });

    testWidgets('«Мероприятия»: ближайшее; тап открывает описание, а «Закрыть» закрывает', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Молодёжная встреча'), findsOneWidget);
      expect(find.text('Сегодня в 23:30'), findsOneWidget);
      expect(find.text('Нажмите, чтобы открыть описание.'), findsOneWidget);
      await tester.tap(find.text('Молодёжная встреча'));
      await tester.pumpAndSettle();
      expect(find.text('Общение, игры и чай после собрания.'), findsOneWidget);
      expect(find.text('Календарь мероприятий'), findsOneWidget);
      await tester.tap(find.widgetWithText(InkWell, 'Закрыть'));
      await tester.pumpAndSettle();
      expect(find.text('Общение, игры и чай после собрания.'), findsNothing);
    });

    testWidgets('мероприятий нет — заглушка без «нажмите»', (tester) async {
      _size(tester);
      final home = _home()..eventsNow = const [];
      await tester.pumpWidget(_app(home, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Мероприятий пока нет'), findsOneWidget);
      expect(find.text('Нажмите, чтобы открыть описание.'), findsNothing);
    });
  });

  group('«Твоё служение на этой неделе»', () {
    ScheduleEvent event(List<ScheduleAssignment> a) =>
        ScheduleEvent(ministry: Ministry.music, planId: 1, title: 'Воскресное богослужение', date: _sunday(), startTime: '10:00', assignments: a);
    ScheduleAssignment assign(int id, String role, AssignmentStatus s) =>
        ScheduleAssignment(id: id, memberId: 9, memberName: 'Я', role: ScheduleRole(id: id, name: role, color: parseHexColor('#112233')), status: s);

    testWidgets('идёт сразу под карточкой «Богослужение»', (tester) async {
      _size(tester);
      final s = FakeSchedule()..music = [event([assign(1, 'Гитара', AssignmentStatus.confirmed)])];
      await tester.pumpWidget(_app(_home(), _prayer(), _session(), schedule: s));
      await tester.pumpAndSettle();
      expect(find.text('ТВОЁ СЛУЖЕНИЕ НА ЭТОЙ НЕДЕЛЕ'), findsOneWidget);
      expect(find.text('Служение: Гитара'), findsOneWidget);
      expect(find.text('Подтверждено'), findsOneWidget);
      expect(find.text('Подтвердить'), findsNothing);
      expect(_top(tester, find.text('ТВОЁ СЛУЖЕНИЕ НА ЭТОЙ НЕДЕЛЕ')), greaterThan(_top(tester, find.text('БОГОСЛУЖЕНИЕ'))));
      expect(_top(tester, find.text('ТВОЁ СЛУЖЕНИЕ НА ЭТОЙ НЕДЕЛЕ')), lessThan(_top(tester, find.text('Молимся сегодня'))));
    });

    testWidgets('нужен ответ: «Подтвердить» отправляет ответ и карточка становится «Подтверждено»', (tester) async {
      _size(tester);
      final s = FakeSchedule()..music = [event([assign(1, 'Гитара', AssignmentStatus.pending)])];
      await tester.pumpWidget(_app(_home(), _prayer(), _session(), schedule: s));
      await tester.pumpAndSettle();
      expect(find.text('Нужен ответ'), findsOneWidget);
      await tester.tap(find.widgetWithText(InkWell, 'Подтвердить'));
      await tester.pumpAndSettle();
      expect(s.calls, contains('status:music:1:confirmed'));
      expect(find.text('Подтверждено'), findsOneWidget);
      expect(find.text('Подтвердить'), findsNothing);
    });

    testWidgets('несколько позиций: «Подтвердить все» и «Отказать по всем»', (tester) async {
      _size(tester);
      final s = FakeSchedule()..music = [event([assign(1, 'Гитара', AssignmentStatus.pending), assign(2, 'Вокал', AssignmentStatus.assigned)])];
      await tester.pumpWidget(_app(_home(), _prayer(), _session(), schedule: s));
      await tester.pumpAndSettle();
      expect(find.text('Подтвердить все'), findsOneWidget);
      expect(find.text('Отказать по всем'), findsOneWidget);
      expect(find.text('Гитара'), findsOneWidget);
      expect(find.text('Вокал'), findsOneWidget);
      await tester.tap(find.widgetWithText(InkWell, 'Отказать по всем'));
      await tester.pumpAndSettle();
      expect(s.calls.where((c) => c.startsWith('status:')), ['status:music:1:declined', 'status:music:2:declined']);
      expect(find.text('Отказ'), findsOneWidget);
    });

    testWidgets('ошибка сети при ответе показана на карточке, кнопки остаются', (tester) async {
      _size(tester);
      final s = FakeSchedule()
        ..music = [event([assign(1, 'Гитара', AssignmentStatus.pending)])]
        ..failStatus = true;
      await tester.pumpWidget(_app(_home(), _prayer(), _session(), schedule: s));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(InkWell, 'Подтвердить'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось сохранить ответ'), findsOneWidget);
      expect(find.text('Подтвердить'), findsOneWidget);
    });

    testWidgets('воскресное собрание: «Служение: Ведущий» без статуса и кнопок', (tester) async {
      _size(tester);
      final s = FakeSchedule()
        ..sunday = [SundayPlan(id: 3, date: _sunday(), startTime: '10:00', published: true, leader: const PersonRef(id: 9, name: 'Я'))];
      await tester.pumpWidget(_app(_home(), _prayer(), _session(), schedule: s));
      await tester.pumpAndSettle();
      expect(find.text('Служение: Ведущий'), findsOneWidget);
      expect(find.text('Нужен ответ'), findsNothing);
      expect(find.text('Подтвердить'), findsNothing);
    });

    testWidgets('нет служений — блока нет', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('ТВОЁ СЛУЖЕНИЕ НА ЭТОЙ НЕДЕЛЕ'), findsNothing);
    });
  });

  group('объявление, срочная нужда, дни рождения', () {
    testWidgets('участник: заметки без меню «⋯»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Помолитесь за семью Ивана'), findsOneWidget);
      expect(find.text('Объявление'), findsOneWidget);
      expect(find.byIcon(Icons.more_horiz_rounded), findsNothing);
    });

    testWidgets('координатор: «⋯» → Изменить / Удалить, удаление с подтверждением', (tester) async {
      _size(tester);
      final p = _prayer();
      await tester.pumpWidget(_app(_home(), p, _session(coordinator: true)));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.more_horiz_rounded), findsNWidgets(2));
      await tester.tap(find.byIcon(Icons.more_horiz_rounded).last);
      await tester.pumpAndSettle();
      expect(find.text('Изменить'), findsOneWidget);
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить объявление?'), findsOneWidget);
      expect(p.calls.where((c) => c.startsWith('delete')), isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Удалить'));
      await tester.pumpAndSettle();
      expect(p.calls, contains('delete:announcement'));
    });

    testWidgets('дни рождения: «Сегодня» и «Завтра», далёкие не показываются', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('ДНИ РОЖДЕНИЯ'), findsOneWidget);
      expect(find.text('Анна Орлова'), findsOneWidget);
      expect(find.text('🎉 Сегодня'), findsOneWidget);
      expect(find.text('Завтра'), findsOneWidget);
      expect(find.text('Далёкий Именинник'), findsNothing);
      expect(find.text('АО'), findsOneWidget);
    });
  });

  group('кнопка «+» и «Отправить нужду»', () {
    const fabTip = 'Срочная нужда и объявление: добавить или изменить';

    testWidgets('«+» есть у координатора и админа, у участника и пастора нет', (tester) async {
      for (final (role, coordinator, expected) in [
        ('member', false, false),
        ('pastor', false, false),
        ('member', true, true),
        ('admin', false, true),
      ]) {
        _size(tester);
        await tester.pumpWidget(_app(_home(), _prayer(), _session(role: role, coordinator: coordinator)));
        await tester.pumpAndSettle();
        expect(find.byTooltip(fabTip), expected ? findsOneWidget : findsNothing, reason: '$role/$coordinator');
      }
    });

    testWidgets('«+» → меню → объявление: публикация и появление на главной', (tester) async {
      _size(tester);
      final p = _prayer()..notesNow = CoordinatorNotes.empty;
      await tester.pumpWidget(_app(_home(), p, _session(coordinator: true)));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip(fabTip));
      await tester.pumpAndSettle();
      expect(find.text('Срочная молитвенная нужда'), findsOneWidget);
      await tester.tap(find.text('Объявление'));
      await tester.pumpAndSettle();
      final field = find.descendant(of: find.byType(BottomSheet), matching: find.byType(TextField));
      final publish = find.widgetWithText(InkWell, 'Опубликовать');
      expect(tester.widget<InkWell>(publish).onTap, isNull, reason: 'без текста публиковать нельзя');
      await tester.enterText(field, 'Собрание в 18:00');
      await tester.pump();
      await tester.tap(find.text('До конца этой недели'));
      await tester.pump();
      await tester.tap(publish);
      await tester.pumpAndSettle();
      expect(p.calls.firstWhere((c) => c.startsWith('save:')), startsWith('save:announcement:Собрание в 18:00:week:'));
      expect(find.text('Собрание в 18:00'), findsOneWidget);
    });

    testWidgets('«Отправить нужду»: короткий текст не отправить, нормальный уходит в чат', (tester) async {
      _size(tester);
      final p = _prayer();
      await tester.pumpWidget(_app(_home(), p, _session()));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(InkWell, 'Отправить нужду'));
      await tester.pumpAndSettle();
      final field = find.descendant(of: find.byType(BottomSheet), matching: find.byType(TextField));
      final send = find.widgetWithText(InkWell, 'Отправить в чат');
      await tester.enterText(field, 'abc');
      await tester.pump();
      expect(tester.widget<InkWell>(send).onTap, isNull);
      await tester.enterText(field, 'Прошу молитвы о работе');
      await tester.pump();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(p.calls, contains('submit:Прошу молитвы о работе'));
      expect(find.text('Нужда отправлена в молитвенный чат'), findsOneWidget);
    });
  });

  group('блок координатора', () {
    testWidgets('куратор видит своих участников на следующую неделю', (tester) async {
      _size(tester);
      final p = _prayer();
      p.weeks[WeekKind.next] = [day(_ymd(_today().add(const Duration(days: 3))), 3, 'Олег Ким'), day(_ymd(_today().add(const Duration(days: 4))), 4, 'Нина Рем', need: 'Работа')];
      p.claimsNow = Claims.fromJson({
        'coordinators': [
          {'id': 9, 'name': 'Мария Лис'},
        ],
        'members': [
          {'id': 3, 'name': 'Олег Ким', 'claimed_by': {'id': 9, 'name': 'Мария Лис'}},
          {'id': 4, 'name': 'Нина Рем', 'claimed_by': {'id': 9, 'name': 'Мария Лис'}},
        ],
      });
      await tester.pumpWidget(_app(_home(), p, _session(coordinator: true)));
      await tester.pumpAndSettle();
      expect(find.text('Координаторам сбора'), findsOneWidget);
      expect(find.text('Ваши участники на следующую неделю:'), findsOneWidget);
      expect(find.text('Ким Олег'), findsOneWidget);
      expect(find.text('Нужда заполнена у 1 из 2'), findsOneWidget);
      expect(find.text('Заполнить нужды'), findsOneWidget);
      expect(_top(tester, find.text('Координаторам сбора')), greaterThan(_top(tester, find.text('Молодёжная встреча'))), reason: 'в конце, как на сайте');
    });

    testWidgets('участник блока не видит', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home(), _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Координаторам сбора'), findsNothing);
    });
  });

  group('устойчивость', () {
    testWidgets('всё упало и копий нет — «Повторить»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_home()..failAll = true, _prayer()..fail = true, _session()));
      await tester.pumpAndSettle();
      expect(find.text('Повторить'), findsOneWidget);
    });

    testWidgets('упало служение и подкаст — остальные карточки на месте', (tester) async {
      _size(tester);
      final h = _home()
        ..failPlans = true
        ..failEpisodes = true;
      await tester.pumpWidget(_app(h, _prayer(), _session()));
      await tester.pumpAndSettle();
      expect(find.text('БОГОСЛУЖЕНИЕ'), findsNothing);
      expect(find.text('Молимся за Эдуард Толстошеин'), findsOneWidget);
      expect(find.text('Молодёжная встреча'), findsOneWidget);
      expect(find.text('Новая проповедь пока не найдена.'), findsOneWidget);
    });

    testWidgets('«Повторить» после ошибки загружает главную', (tester) async {
      _size(tester);
      final h = _home()..failAll = true;
      await tester.pumpWidget(_app(h, _prayer(), _session()));
      await tester.pumpAndSettle();
      h.failAll = false;
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(find.text('Молимся сегодня'), findsOneWidget);
    });
  });

  group('вёрстка без переполнений', () {
    for (final (width, scale, brightness) in [
      (320.0, 1.0, Brightness.light),
      (320.0, 2.0, Brightness.light),
      (390.0, 1.3, Brightness.light),
      (320.0, 2.0, Brightness.dark),
      (360.0, 1.0, Brightness.dark),
    ]) {
      testWidgets('главная: ширина $width, шрифт $scale, ${brightness.name}', (tester) async {
        _size(tester, width: width, height: 6000);
        final s = FakeSchedule()
          ..music = [
            ScheduleEvent(
              ministry: Ministry.music,
              planId: 1,
              title: 'Воскресное богослужение с очень длинным названием собрания',
              date: _sunday(),
              startTime: '10:00',
              assignments: [
                ScheduleAssignment(id: 1, memberId: 9, memberName: 'Я', role: ScheduleRole(id: 1, name: 'Руководитель группы прославления', color: parseHexColor('#112233')), status: AssignmentStatus.pending),
                ScheduleAssignment(id: 2, memberId: 9, memberName: 'Я', role: ScheduleRole(id: 2, name: 'Вокал', color: parseHexColor('#334455')), status: AssignmentStatus.confirmed),
              ],
            ),
          ];
        final h = _home()
          ..people = {
            7: const ServicePerson(id: 7, name: 'Константинопольский Александр Константинович'),
            8: const ServicePerson(id: 8, name: 'Дмитрий Сорокин'),
          }
          ..broadcastNow = BroadcastInfo(
            status: 'live',
            title: 'Очень длинное название трансляции воскресного служения церкви',
            startsAt: DateTime.now().subtract(const Duration(minutes: 5)),
            platform: 'vk',
            description: 'Длинное описание трансляции ' * 5,
          )
          ..episodesNow = [Episode(title: 'Очень длинное название проповеди ' * 4, audioUrl: 'https://x/a.mp3')];
        final p = _prayer()
          ..notesNow = CoordinatorNotes(
            urgent: CoordinatorNote(text: 'Очень длинная срочная молитвенная нужда ' * 8),
            announcement: CoordinatorNote(text: 'Длинное объявление ' * 12),
          );
        await tester.pumpWidget(_app(h, p, _session(role: 'admin', coordinator: true), schedule: s, width: width, scale: scale, height: 6000, brightness: brightness));
        await tester.pump(const Duration(milliseconds: 200));
        await tester.pump(const Duration(milliseconds: 200));
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip('Срочная нужда и объявление: добавить или изменить'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      });
    }
  });
}
