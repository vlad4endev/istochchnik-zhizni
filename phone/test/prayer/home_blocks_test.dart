import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/home/home_page.dart';
import 'package:molitva/features/prayer/data/prayer_source.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_prayer.dart';

class _EmptyNet implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromString(jsonEncode(options.path.endsWith('/events') ? <Object>[] : <String, Object>{}), 200,
          headers: {Headers.contentTypeHeader: ['application/json']});

  @override
  void close({bool force = false}) {}
}

SessionController _session({String role = 'member', bool coordinator = false}) {
  final s = SessionController();
  s.dio.httpClientAdapter = _EmptyNet();
  s.user = AppUser(
    id: 9,
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

Widget _app(PrayerSource source, SessionController session, {double scale = 1, double width = 360}) =>
    ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(
          data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
          child: HomePage(prayerSource: source),
        ),
      ),
    );

void _size(WidgetTester tester, {double width = 360}) {
  tester.view.physicalSize = Size(width, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

DateTime _in(int days) {
  final n = DateTime.now().add(Duration(days: days));
  return DateTime(n.year, n.month, n.day);
}

String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

FakePrayer _fake() {
  final s = FakePrayer()
    ..notesNow = const CoordinatorNotes(
      urgent: CoordinatorNote(text: 'Помолитесь за семью Ивана'),
      announcement: CoordinatorNote(text: 'В субботу общее собрание в 18:00'),
    )
    ..birthdaysNow = [
      Birthday(id: 1, name: 'Анна Орлова', date: _in(0)),
      Birthday(id: 2, name: 'Пётр Сидоров', date: _in(1)),
      Birthday(id: 3, name: 'Далёкий Именинник', date: _in(10)),
    ];
  s.weeks[WeekKind.next] = [day(_ymd(_in(3)), 3, 'Олег Ким'), day(_ymd(_in(4)), 4, 'Нина Рем', need: 'Работа')];
  s.claimsNow = Claims.fromJson({
    'coordinators': [
      {'id': 9, 'name': 'Мария Лис'},
    ],
    'members': [
      {'id': 3, 'name': 'Олег Ким', 'claimed_by': {'id': 9, 'name': 'Мария Лис'}},
      {'id': 4, 'name': 'Нина Рем', 'claimed_by': {'id': 9, 'name': 'Мария Лис'}},
    ],
  });
  return s;
}

Future<void> _scrollTo(WidgetTester tester, Finder target) async {
  await tester.dragUntilVisible(target, find.byType(ListView).first, const Offset(0, -250));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('участник: объявление и срочная нужда без кнопок правки, без блока координатора', (tester) async {
    _size(tester);
    await tester.pumpWidget(_app(_fake(), _session()));
    await tester.pumpAndSettle();
    expect(find.text('Помолитесь за семью Ивана'), findsOneWidget);
    expect(find.text('В субботу общее собрание в 18:00'), findsOneWidget);
    expect(find.text('Изменить'), findsNothing);
    expect(find.text('Удалить'), findsNothing);
    expect(find.text('Координаторам сбора'), findsNothing);
  });

  testWidgets('дни рождения: сегодня и завтра, далёкие не показываются', (tester) async {
    _size(tester);
    await tester.pumpWidget(_app(_fake(), _session()));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Пётр Сидоров'));
    expect(find.text('ДНИ РОЖДЕНИЯ'), findsOneWidget);
    expect(find.text('Анна Орлова'), findsOneWidget);
    expect(find.text('Сегодня'), findsOneWidget);
    expect(find.text('Завтра'), findsOneWidget);
    expect(find.text('Далёкий Именинник'), findsNothing);
  });

  testWidgets('координатор: свои участники на следующую неделю и кнопка в очередь', (tester) async {
    _size(tester);
    await tester.pumpWidget(_app(_fake(), _session(coordinator: true)));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Заполнить нужды'));
    expect(find.text('Координаторам сбора'), findsOneWidget);
    expect(find.text('Ваши участники на следующую неделю:'), findsOneWidget);
    expect(find.text('Ким Олег'), findsOneWidget);
    expect(find.text('Рем Нина'), findsOneWidget);
    expect(find.text('Нужда заполнена у 1 из 2'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
    expect(find.byIcon(Icons.remove_circle_outline_rounded), findsOneWidget);
  });

  testWidgets('координатор: править и удалять заметки на главной можно', (tester) async {
    _size(tester);
    final s = _fake();
    await tester.pumpWidget(_app(s, _session(coordinator: true)));
    await tester.pumpAndSettle();
    expect(find.text('Изменить'), findsNWidgets(2));
    await tester.tap(find.text('Удалить').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Удалить').last);
    await tester.pumpAndSettle();
    expect(s.calls, contains('delete:announcement'));
  });

  testWidgets('админ: обзор — у кого не заполнена нужда и кто куратор', (tester) async {
    _size(tester);
    final s = _fake();
    s.weeks[WeekKind.current] = [day(_ymd(_in(1)), 7, 'Глеб Ушаков'), day(_ymd(_in(2)), 8, 'Вера Щукина', need: 'ок')];
    await tester.pumpWidget(_app(s, _session(role: 'admin')));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Открыть очередь'));
    expect(find.text('На этой неделе не заполнена нужда:'), findsOneWidget);
    expect(find.text('Ушаков Глеб'), findsOneWidget);
    expect(find.text('Щукина Вера'), findsNothing, reason: 'заполненные не показываем');
  });

  testWidgets('без сети блоки молитвы не ломают главную', (tester) async {
    _size(tester);
    final s = _fake()..fail = true;
    await tester.pumpWidget(_app(s, _session(coordinator: true)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Главная'), findsOneWidget);
    expect(find.text('Координаторам сбора'), findsNothing);
  });

  for (final (width, scale) in [(320.0, 1.0), (320.0, 2.0)]) {
    testWidgets('вёрстка главной: ширина $width, шрифт $scale', (tester) async {
      _size(tester, width: width);
      await tester.pumpWidget(_app(_fake(), _session(coordinator: true), width: width, scale: scale));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _scrollTo(tester, find.text('Заполнить нужды'));
      expect(tester.takeException(), isNull);
      await _scrollTo(tester, find.text('Пётр Сидоров'));
      expect(tester.takeException(), isNull);
    });
  }
}
