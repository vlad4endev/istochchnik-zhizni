import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/prayer/collection_page.dart';
import 'package:molitva/features/prayer/data/prayer_source.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';
import 'package:molitva/features/prayer/prayer_page.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_prayer.dart';

SessionController _session({String role = 'member', bool coordinator = false}) {
  final s = SessionController();
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

Widget _app(Widget page, SessionController session, {double scale = 1, double width = 360}) =>
    ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(
          data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
          child: page,
        ),
      ),
    );

/// ListView ленивый: нижние блоки строятся только после прокрутки.
Future<void> _reveal(WidgetTester tester, Finder target) async {
  await tester.dragUntilVisible(target, find.byType(ListView).first, const Offset(0, -250));
  await tester.pumpAndSettle();
}

void _size(WidgetTester tester, {double width = 360}) {
  tester.view.physicalSize = Size(width, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<Map<String, dynamic>> _fullDay(String iso) async => {
      'members': [
        {'id': 1, 'name': 'Иван Петров', 'prayer_request': 'О здоровье семьи'},
      ],
      'global_themes': [
        {'id': 1, 'title': 'Единство', 'prayer_points': 'Мир в церкви', 'bible_verse': 'Иоанна 17:21'},
      ],
      'ministries': [
        {'id': 1, 'title': 'Молодёжь', 'prayer_points': 'Новые участники'},
      ],
      'backsliders': [
        {'id': 4, 'name': 'Пётр Сидоров'},
      ],
    };

FakePrayer _fake() => FakePrayer()
  ..viewersNow = ViewersToday.fromJson({
    'unique_viewers_today': 2,
    'viewers': [
      {'member_id': 1, 'name': 'Иван Петров', 'first_seen_at': '2026-11-21T08:30:00'},
      {'member_id': 2, 'name': 'Анна Орлова', 'first_seen_at': '2026-11-21T09:10:00'},
    ],
  });

PrayerPage _page(FakePrayer s, {Future<Map<String, dynamic>> Function(String)? day}) =>
    PrayerPage(source: s, loadDay: day ?? _fullDay);

/// Поле ввода внутри нижнего листа (на странице под ним есть своё поле поиска).
Finder get _sheetField => find.descendant(of: find.byType(BottomSheet), matching: find.byType(TextField));

/// Открыть лист дня: карточка может быть ниже экрана.
Future<void> _openDay(WidgetTester tester, String name, {bool partial = false}) async {
  final target = partial ? find.textContaining(name) : find.text(name);
  await _reveal(tester, target);
  await tester.tap(target.first);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('экран «Молитва»: участник', () {
    testWidgets('видит блок «Молимся за отпавшего» и не видит инструментов координатора', (tester) async {
      _size(tester);
      final s = _fake()..notesNow = const CoordinatorNotes(urgent: CoordinatorNote(text: 'Помолитесь за Ивана'));
      await tester.pumpWidget(_app(_page(s), _session()));
      await tester.pumpAndSettle();
      expect(find.text('СРОЧНАЯ МОЛИТВЕННАЯ НУЖДА'), findsOneWidget);
      expect(find.text('Помолитесь за Ивана'), findsOneWidget);
      expect(find.text('Изменить'), findsNothing, reason: 'участник не правит срочные нужды');
      expect(find.text('КООРДИНАТОРАМ'), findsNothing);
      await _reveal(tester, find.text('Пётр Сидоров'));
      expect(find.text('МОЛИМСЯ ЗА ОТПАВШЕГО'), findsOneWidget);
      expect(find.text('Пётр Сидоров'), findsOneWidget);
      expect(find.text('Отпавший — нуждается в молитве о возвращении'), findsOneWidget);
      expect(find.textContaining('раздел открыли'), findsNothing);
      expect(s.calls, contains('visit'), reason: 'визит раздела фиксируется');
      expect(s.calls, isNot(contains('viewers')), reason: 'статистику участнику не грузим');
    });

    testWidgets('только отпавшие на этот день — это не «пусто»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(
        _page(_fake(), day: (_) async => {'backsliders': [{'id': 1, 'name': 'Пётр'}]}),
        _session(),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Пётр'), findsOneWidget);
      expect(find.text('На эту дату записей нет'), findsNothing);
    });

    testWidgets('ничего нет — понятное пустое состояние', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_page(_fake(), day: (_) async => {}), _session()));
      await tester.pumpAndSettle();
      expect(find.text('На эту дату записей нет'), findsOneWidget);
    });

    testWidgets('ошибка загрузки дня — «Повторить», а свои инструменты остаются', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_page(_fake(), day: (_) async => throw StateError('net')), _session()));
      await tester.pumpAndSettle();
      expect(find.text('Повторить'), findsOneWidget);
      expect(find.text('Моя молитвенная нужда'), findsOneWidget);
    });

    testWidgets('поделиться нуждой: короткий текст не отправить, длинный уходит в чат', (tester) async {
      _size(tester);
      final s = _fake();
      await tester.pumpWidget(_app(_page(s), _session()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Поделиться нуждой с чатом'));
      await tester.pumpAndSettle();
      Finder send() => find.widgetWithText(InkWell, 'Отправить в чат');
      await tester.enterText(find.byType(TextField), 'abc');
      await tester.pump();
      expect(tester.widget<InkWell>(send()).onTap, isNull, reason: 'меньше 5 символов');
      await tester.enterText(find.byType(TextField), 'Прошу молитвы о работе');
      await tester.pump();
      await tester.tap(send());
      await tester.pumpAndSettle();
      expect(s.calls, contains('submit:Прошу молитвы о работе'));
      expect(find.text('Нужда отправлена в молитвенный чат'), findsOneWidget);
    });

    testWidgets('поделиться нуждой: ошибка сервера показана, текст сохранён', (tester) async {
      _size(tester);
      final s = _fake()..fail = true;
      await tester.pumpWidget(_app(_page(s), _session()));
      await tester.pumpAndSettle();
      // fail=true ломает и registerVisit/notes — они молча игнорируются
      await tester.tap(find.text('Поделиться нуждой с чатом'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Прошу молитвы о работе');
      await tester.pump();
      await tester.tap(find.widgetWithText(InkWell, 'Отправить в чат'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось выполнить действие'), findsOneWidget);
      expect(find.text('Прошу молитвы о работе'), findsOneWidget);
    });
  });

  group('экран «Молитва»: координатор, пастор, админ', () {
    testWidgets('координатор: очередь, срочная нужда, объявление; без Telegram и статистики', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_page(_fake()), _session(coordinator: true)));
      await tester.pumpAndSettle();
      expect(find.text('КООРДИНАТОРАМ'), findsOneWidget);
      expect(find.text('Сбор нужд · очередь недели'), findsOneWidget);
      expect(find.text('Срочная молитвенная нужда'), findsOneWidget);
      expect(find.text('Объявление на главной'), findsOneWidget);
      expect(find.text('Рассылка в Telegram'), findsNothing);
      expect(find.textContaining('раздел открыли'), findsNothing);
    });

    testWidgets('пастор: очередь и статистика посещений, но не правка заметок', (tester) async {
      _size(tester);
      final s = _fake();
      await tester.pumpWidget(_app(_page(s), _session(role: 'pastor')));
      await tester.pumpAndSettle();
      expect(find.text('Сбор нужд · очередь недели'), findsOneWidget);
      expect(find.text('Объявление на главной'), findsNothing);
      await _reveal(tester, find.text('Посмотреть список'));
      expect(find.text('Сегодня раздел открыли 2 человека'), findsOneWidget);
      await tester.tap(find.text('Посмотреть список'));
      await tester.pumpAndSettle();
      expect(find.text('Петров Иван'), findsOneWidget);
      expect(find.text('Орлова Анна'), findsOneWidget);
    });

    testWidgets('админ: рассылка в Telegram — превью, подтверждение и отправка', (tester) async {
      _size(tester);
      final s = _fake();
      await tester.pumpWidget(_app(_page(s), _session(role: 'admin')));
      await tester.pumpAndSettle();
      await _reveal(tester, find.text('Рассылка в Telegram'));
      await tester.tap(find.text('Рассылка в Telegram'));
      await tester.pumpAndSettle();
      expect(find.text('Молитва дня: Иван Петров'), findsOneWidget);
      await tester.tap(find.widgetWithText(InkWell, 'Отправить сейчас'));
      await tester.pumpAndSettle();
      expect(find.text('Отправить рассылку сейчас?'), findsOneWidget);
      expect(s.calls.where((c) => c.startsWith('tg-send')), isEmpty, reason: 'без подтверждения ничего не уходит');
      await tester.tap(find.widgetWithText(TextButton, 'Отправить'));
      await tester.pumpAndSettle();
      expect(s.calls.where((c) => c.startsWith('tg-send')).length, 1);
      expect(find.text('Рассылка отправлена: 5'), findsOneWidget);
    });

    testWidgets('срочная нужда: публикация со сроком «до конца недели»', (tester) async {
      _size(tester);
      final s = _fake();
      await tester.pumpWidget(_app(_page(s), _session(coordinator: true)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Срочная молитвенная нужда'));
      await tester.pumpAndSettle();
      final publish = find.widgetWithText(InkWell, 'Опубликовать');
      expect(tester.widget<InkWell>(publish).onTap, isNull, reason: 'без текста публиковать нельзя');
      await tester.enterText(find.byType(TextField), 'Срочно помолитесь о Пете');
      await tester.pump();
      await tester.tap(find.text('До конца этой недели'));
      await tester.pump();
      await tester.tap(publish);
      await tester.pumpAndSettle();
      final save = s.calls.firstWhere((c) => c.startsWith('save:'));
      expect(save, startsWith('save:urgent_prayer:Срочно помолитесь о Пете:week:'));
      expect(find.text('Срочно помолитесь о Пете'), findsOneWidget, reason: 'карточка появилась на экране');
    });

    testWidgets('удаление срочной нужды требует подтверждения', (tester) async {
      _size(tester);
      final s = _fake()..notesNow = const CoordinatorNotes(urgent: CoordinatorNote(text: 'Срочно!'));
      await tester.pumpWidget(_app(_page(s), _session(coordinator: true)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить срочную нужду?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Отмена'));
      await tester.pumpAndSettle();
      expect(s.calls.where((c) => c.startsWith('delete')), isEmpty);
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Удалить').last);
      await tester.pumpAndSettle();
      expect(s.calls, contains('delete:urgent_prayer'));
      expect(find.text('Срочно!'), findsNothing);
    });

    testWidgets('ошибка сохранения заметки показана внутри листа', (tester) async {
      _size(tester);
      final s = _fake();
      await tester.pumpWidget(_app(_page(s), _session(coordinator: true)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Объявление на главной'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Собрание в 18:00');
      await tester.pump();
      s.fail = true;
      await tester.tap(find.widgetWithText(InkWell, 'Опубликовать'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось выполнить действие'), findsOneWidget);
      expect(find.text('Собрание в 18:00'), findsOneWidget, reason: 'введённый текст не пропал');
    });
  });

  group('вёрстка без переполнений', () {
    for (final (width, scale) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('«Молитва» админа: ширина $width, шрифт $scale', (tester) async {
        _size(tester, width: width);
        final s = _fake()
          ..notesNow = CoordinatorNotes(
            urgent: CoordinatorNote(text: 'Очень длинная срочная молитвенная нужда ' * 8),
            announcement: CoordinatorNote(text: 'Длинное объявление ' * 10),
          );
        await tester.pumpWidget(_app(_page(s), _session(role: 'admin', coordinator: true), width: width, scale: scale));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await _reveal(tester, find.text('Посмотреть список'));
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('«Сбор нужд»', () {
    Widget page(FakePrayer s, {double scale = 1, double width = 360}) =>
        _app(CollectionPage(source: s), _session(coordinator: true), scale: scale, width: width);

    testWidgets('дни недели, прогресс и фильтр «Без текста нужды»', (tester) async {
      _size(tester);
      await tester.pumpWidget(page(FakePrayer()));
      await tester.pumpAndSettle();
      expect(find.text('Петров Иван'), findsOneWidget);
      expect(find.text('Орлова Анна'), findsOneWidget);
      expect(find.text('1 из 2'), findsOneWidget);
      expect(find.text('Куратор не назначен'), findsNWidgets(2));
      // В тестовом шрифте (Ahem) чипы шире, чем на устройстве: жмём по их видимому краю.
      final chip = find.textContaining('Без текста нужды', findRichText: true);
      final box = tester.getRect(chip);
      await tester.tapAt(Offset(box.left + 8, box.center.dy));
      await tester.pumpAndSettle();
      expect(find.text('Петров Иван'), findsNothing);
      expect(find.text('Орлова Анна'), findsOneWidget);
    });

    testWidgets('переключение на следующую неделю', (tester) async {
      _size(tester);
      final s = FakePrayer();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Следующая'));
      await tester.pumpAndSettle();
      expect(find.text('Ким Олег'), findsOneWidget);
      expect(find.text('Петров Иван'), findsNothing);
    });

    testWidgets('день: правка нужды сохраняется на сервер и сразу видна в списке', (tester) async {
      _size(tester);
      final s = FakePrayer();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await _openDay(tester, 'Орлова Анна');
      await tester.enterText(_sheetField, 'О работе мужа');
      await tester.pump();
      await tester.tap(find.widgetWithText(InkWell, 'Сохранить нужду'));
      await tester.pumpAndSettle();
      expect(s.calls, contains('need:2:2026-11-24:О работе мужа'));
      expect(find.text('Сохранено. Участник получит уведомление.'), findsOneWidget);
    });

    testWidgets('день: назначение куратора', (tester) async {
      _size(tester);
      final s = FakePrayer();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await _openDay(tester, 'Орлова Анна');
      await tester.ensureVisible(find.text('Лис Мария (вы)'));
      await tester.tap(find.text('Лис Мария (вы)'));
      await tester.pumpAndSettle();
      expect(s.calls.any((c) => c.startsWith('assign:2:9:')), isTrue);
    });

    testWidgets('день: «Улучшить с ИИ» подставляет текст и предупреждает про ИИ', (tester) async {
      _size(tester);
      final s = FakePrayer();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await _openDay(tester, 'Петров Иван');
      expect(find.textContaining('Подготовлено с помощью ИИ'), findsOneWidget);
      await tester.ensureVisible(find.widgetWithText(InkWell, 'Улучшить с ИИ'));
      await tester.tap(find.widgetWithText(InkWell, 'Улучшить с ИИ'));
      await tester.pumpAndSettle();
      expect(find.text('Здоровье (улучшено)'), findsOneWidget);
    });

    testWidgets('автораспределение: подтверждение и итог', (tester) async {
      _size(tester);
      final s = FakePrayer();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Автораспределить кураторов'));
      await tester.pumpAndSettle();
      expect(s.calls.where((c) => c.startsWith('distribute')), isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Распределить'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Готово: 7 назначений, уведомлены 2 куратора'), findsOneWidget);
    });

    testWidgets('без отметок сбора: предупреждение, куратор-фильтров нет', (tester) async {
      _size(tester);
      await tester.pumpWidget(page(FakePrayer()..failClaims = true));
      await tester.pumpAndSettle();
      expect(find.textContaining('Отметки сбора сейчас недоступны'), findsOneWidget);
      expect(find.textContaining('Мои дни'), findsNothing);
      expect(find.text('Петров Иван'), findsOneWidget);
    });

    testWidgets('ошибка загрузки недели — «Повторить»', (tester) async {
      _size(tester);
      await tester.pumpWidget(page(FakePrayer()..fail = true));
      await tester.pumpAndSettle();
      expect(find.text('Повторить'), findsOneWidget);
    });

    for (final (width, scale) in [(320.0, 1.0), (320.0, 2.0)]) {
      testWidgets('вёрстка: ширина $width, шрифт $scale, день и лист', (tester) async {
        _size(tester, width: width);
        final s = FakePrayer();
        s.weeks[WeekKind.current] = [
          day('2026-11-23', 1, 'Константинопольский Александр Константинович', need: 'Очень длинная нужда ' * 20),
          day('2026-11-24', 2, 'Анна Орлова'),
        ];
        await tester.pumpWidget(page(s, width: width, scale: scale));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await _openDay(tester, 'Константинопольский', partial: true);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
