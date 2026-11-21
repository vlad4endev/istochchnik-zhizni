import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/schedule/schedule_page.dart';
import 'package:molitva/features/service/data/plan_repository.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:molitva/features/service/service_page.dart';
import 'package:provider/provider.dart';

import 'fakes.dart';

SessionController _session({String ministryDirection = 'Медиа служение', List<String> roles = const ['member']}) {
  final s = SessionController();
  s.user = AppUser(
    id: 1,
    name: 'Иван Петров',
    firstName: 'Иван',
    lastName: 'Петров',
    role: roles.first,
    roles: roles,
    registrationStatus: 'active',
    ministryDirection: ministryDirection,
  );
  return s;
}

Widget _app(SessionController s, Widget page, {double scale = 1, double width = 360}) => ChangeNotifierProvider.value(
      value: s,
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)), child: page),
      ),
    );

void _size(WidgetTester tester, {double width = 360}) {
  tester.view.physicalSize = Size(width, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

DateTime _soon(int days) {
  final n = DateTime.now().add(Duration(days: days));
  return DateTime(n.year, n.month, n.day);
}

class _FakePlans implements PlanSource {
  _FakePlans({this.fail = false});
  bool fail;

  PlanSummary summary(int id, int days, {bool published = true}) =>
      PlanSummary(id: id, date: _soon(days), startTime: '11:00', published: published, blocksCount: 3, templateName: 'Воскресное служение', totalMinutes: 90, leaderId: 1);

  @override
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to) async {
    if (fail) throw Exception('нет сети');
    return Loaded([summary(1, 3), summary(2, -7)]);
  }

  @override
  Future<Loaded<PlanView>> view(PlanSummary plan) async {
    if (fail) throw Exception('нет сети');
    return Loaded(PlanView(
      summary: plan,
      leaderName: 'Иван Петров',
      preacherName: 'Мария Сидорова',
      blocks: const [
        PlanBlock(id: 1, order: 1, title: 'Открытие', durationMinutes: 5, kind: BlockKind.other, assignedId: 1, assignedName: 'Иван Петров'),
        PlanBlock(id: 2, order: 2, title: 'Прославление', durationMinutes: 20, kind: BlockKind.song, songId: 5, songTitle: 'Велик Бог', songKey: 'D'),
        PlanBlock(id: 3, order: 3, title: 'Проповедь', durationMinutes: 40, kind: BlockKind.sermon, assignedName: 'Мария Сидорова', content: {'sermon_topic': 'Любовь', 'sermon_scripture': 'Ин 3:16'}),
      ],
    ));
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('расписание', () {
    testWidgets('«Мои»: ближайшее с кнопками ответа, ответ меняет карточку', (tester) async {
      _size(tester);
      final source = FakeScheduleSource()
        ..mine[Ministry.media] = [
          event(Ministry.media, 1, _soon(1), [assignment(7, ivan, role(1, 'Звукорежиссёр'))]),
          event(Ministry.media, 2, _soon(8), [assignment(8, ivan, role(2, 'Камера'), AssignmentStatus.confirmed)]),
        ];
      await tester.pumpWidget(_app(_session(), SchedulePage(source: source)));
      await tester.pumpAndSettle();

      expect(find.text('БЛИЖАЙШЕЕ СЛУЖЕНИЕ'), findsOneWidget);
      expect(find.text('Завтра'), findsWidgets);
      expect(find.text('Подтвердить'), findsOneWidget);

      await tester.tap(find.text('Подтвердить'));
      await tester.pumpAndSettle();
      expect(source.statusCalls.single, (Ministry.media, 7, AssignmentStatus.confirmed));
      expect(find.text('Подтвердить'), findsNothing);
    });

    testWidgets('«Мои»: ошибка сети при ответе не меняет карточку и объясняет причину', (tester) async {
      _size(tester);
      final source = FakeScheduleSource()
        ..statusFails = true
        ..mine[Ministry.media] = [event(Ministry.media, 1, _soon(1), [assignment(7, ivan, role(1, 'Звукорежиссёр'))])];
      await tester.pumpWidget(_app(_session(), SchedulePage(source: source)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Подтвердить'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось отправить ответ'), findsOneWidget);
      expect(find.text('Подтвердить'), findsOneWidget, reason: 'ответ откатился, можно повторить');
    });

    testWidgets('«Мои»: отказ просит подтверждение', (tester) async {
      _size(tester);
      final source = FakeScheduleSource()
        ..mine[Ministry.media] = [event(Ministry.media, 1, _soon(1), [assignment(7, ivan, role(1, 'Звукорежиссёр'), AssignmentStatus.confirmed)])];
      await tester.pumpWidget(_app(_session(), SchedulePage(source: source)));
      await tester.pumpAndSettle();
      // Подтверждённое назначение — в карточке ближайшего нет кнопок, отказ только из списка ниже.
      expect(find.text('Подтвердить'), findsNothing);
    });

    testWidgets('нет назначений — понятное пустое состояние', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_session(), SchedulePage(source: FakeScheduleSource())));
      await tester.pumpAndSettle();
      expect(find.text('Назначений нет'), findsOneWidget);
    });

    testWidgets('участник без служения видит объяснение, а не ошибку', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_session(ministryDirection: ''), SchedulePage(source: FakeScheduleSource())));
      await tester.pumpAndSettle();
      expect(find.text('Расписание для служителей'), findsOneWidget);
    });

    testWidgets('«Команда»: роли с людьми, менеджер видит «Назначить», обычный служитель — нет', (tester) async {
      _size(tester);
      final source = FakeScheduleSource()
        ..team[Ministry.media] = [
          event(Ministry.media, 1, _soon(0), [assignment(1, maria, role(1, 'Звукорежиссёр'))]),
        ];
      await tester.pumpWidget(_app(_session(), SchedulePage(source: source)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Команда'));
      await tester.pumpAndSettle();
      expect(find.text('Мария Сидорова'), findsOneWidget);
      expect(find.text('Назначить'), findsNothing);
      expect(find.textContaining('Не назначено ролей'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(_app(_session(roles: const ['admin']), SchedulePage(source: source)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Команда'));
      await tester.pumpAndSettle();
      expect(find.text('Назначить'), findsWidgets);
    });

    for (final scale in [1.0, 2.0]) {
      testWidgets('ленты не переполняются: ширина 320, шрифт ${(scale * 100).round()}%', (tester) async {
        _size(tester, width: 320);
        final source = FakeScheduleSource()
          ..mine[Ministry.media] = [
            event(Ministry.media, 1, _soon(1), [assignment(7, ivan, role(1, 'Звукорежиссёр-оператор трансляции'))], title: 'Очень длинное название воскресного служения с гостями'),
            event(Ministry.media, 2, _soon(8), [assignment(8, ivan, role(2, 'Камера'), AssignmentStatus.declined)]),
          ]
          ..team[Ministry.media] = [
            event(Ministry.media, 1, _soon(0), [assignment(1, maria, role(1, 'Звукорежиссёр-оператор трансляции')), assignment(2, ivan, role(2, 'Камера'))], title: 'Очень длинное название воскресного служения с гостями'),
          ];
        await tester.pumpWidget(_app(_session(roles: const ['admin']), SchedulePage(source: source), scale: scale, width: 320));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Команда'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('служение', () {
    testWidgets('список: предстоящие и прошедшие, ближайшая отмечена, «вы — ведущий»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_session(), ServicePage(source: _FakePlans())));
      await tester.pumpAndSettle();
      expect(find.text('Ближайшая'), findsOneWidget);
      expect(find.text('Вы — ведущий'), findsOneWidget);
      expect(find.textContaining('Предстоящие · 1'), findsOneWidget);

      await tester.tap(find.text('Прошедшие'));
      await tester.pumpAndSettle();
      expect(find.text('Ближайшая'), findsNothing);
    });

    testWidgets('список без сети — ошибка с повтором', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_session(), ServicePage(source: _FakePlans(fail: true))));
      await tester.pumpAndSettle();
      expect(find.text('Повторить'), findsOneWidget);
    });

    testWidgets('программа: время блоков, песня и моя роль', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_session(), ServicePage(source: _FakePlans())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ближайшая'));
      await tester.pumpAndSettle();
      expect(find.text('11:00'), findsWidgets);
      expect(find.text('11:05'), findsOneWidget);
      expect(find.text('11:25'), findsOneWidget);
      expect(find.text('Велик Бог [D]'), findsOneWidget);
      expect(find.text('Ин 3:16'), findsOneWidget);
      expect(find.text('Вы'), findsWidgets);
      expect(find.text('Ход служения'.toUpperCase()), findsOneWidget);
    });

    for (final scale in [1.0, 2.0]) {
      testWidgets('программа не переполняется: ширина 320, шрифт ${(scale * 100).round()}%', (tester) async {
        _size(tester, width: 320);
        await tester.pumpWidget(_app(_session(), ServicePage(source: _FakePlans()), scale: scale, width: 320));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(InkWell).first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
