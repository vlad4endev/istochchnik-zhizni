import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/church_api.dart';
import 'package:molitva/core/push_status.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/more/logic/more_logic.dart';
import 'package:molitva/features/more/more_page.dart';
import 'package:molitva/features/profile/logic/profile_form.dart';
import 'package:molitva/features/profile/profile_page.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

AppUser _user({String role = 'member', List<String>? roles, String ministry = '', String direction = '', String? birth, String email = '', String? username = 'maria'}) => AppUser(
      id: 1,
      name: 'Мария Лис',
      firstName: 'Мария',
      lastName: 'Лис',
      role: role,
      roles: roles ?? [role],
      registrationStatus: 'active',
      phone: '+7 900 000-00-00',
      username: username,
      ministryRole: ministry,
      ministryDirection: direction,
      birthDate: birth,
      email: email,
      prayerRequest: 'О семье',
    );

class _Launcher extends UrlLauncherPlatform {
  final opened = <String>[];

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    opened.add(url);
    return true;
  }
}

class _FakeStatus extends PushStatus {
  _FakeStatus() : super.test();

  @override
  Future<void> refresh() async {}
}

class _FakeApi extends ChurchApi {
  _FakeApi(super.session);
  final patches = <Map<String, dynamic>>[];
  Object? fail;

  @override
  Future<AppUser> patchMe(Map<String, dynamic> body) async {
    if (fail != null) throw fail!;
    patches.add(body);
    final u = session.user!;
    final next = AppUser(
      id: u.id,
      name: u.name,
      firstName: (body['first_name'] ?? u.firstName) as String,
      lastName: (body['last_name'] ?? u.lastName) as String,
      role: u.role,
      roles: u.roles,
      registrationStatus: u.registrationStatus,
      phone: u.phone,
      username: u.username,
      ministryRole: u.ministryRole,
      ministryDirection: u.ministryDirection,
      email: (body['email'] ?? u.email) as String,
      birthDate: body.containsKey('birth_date') ? body['birth_date'] as String? : u.birthDate,
      prayerRequest: (body['prayer_request'] ?? u.prayerRequest) as String,
    );
    session.user = next;
    return next;
  }
}

SessionController _session(AppUser user) {
  final s = SessionController();
  s.user = user;
  return s;
}

Widget _app(Widget home, SessionController session, {double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 800), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

Finder _field(String key) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(TextField));

void _size(WidgetTester tester, [double w = 360, double h = 800]) {
  tester.view.physicalSize = Size(w, h);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('логика', () {
    test('адрес админки на сайте', () {
      expect(adminUrl('https://app.example'), 'https://app.example/admin');
      expect(adminUrl('https://app.example/', 'roles'), 'https://app.example/admin?tab=roles');
    });

    test('админский блок только у администратора', () {
      expect(canSeeAdmin(_user(role: 'admin')), isTrue);
      expect(canSeeAdmin(_user(roles: ['member', 'admin'])), isTrue);
      expect(canSeeAdmin(_user(role: 'pastor')), isFalse);
      expect(canSeeAdmin(null), isFalse);
    });

    test('поиск раздела: по названию и ключевым словам, без регистра и «ё»', () {
      const entries = [
        MoreEntry(id: 'a', label: 'Песенник', group: 'g', keywords: ['аккорды']),
        MoreEntry(id: 'b', label: 'Мероприятия', group: 'g', keywords: ['события']),
      ];
      expect([for (final e in filterEntries(entries, 'ПЕСЕН')) e.id], ['a']);
      expect([for (final e in filterEntries(entries, 'события')) e.id], ['b']);
      expect(filterEntries(entries, '').length, 2);
      expect(filterEntries(entries, 'ъъъ'), isEmpty);
    });

    test('подпись заявок', () {
      expect(requestsSubtitle(null), 'Регистрация и сброс пароля');
      expect(requestsSubtitle(0), 'Новых заявок нет');
      expect(requestsSubtitle(3), 'Ждут решения: 3');
    });

    test('форма профиля: проверка и только изменённые поля', () {
      final saved = ProfileForm.of(_user(birth: '1990-03-05', email: 'a@b.ru'));
      expect(saved.validate(), isNull);
      expect(saved.diff(saved), isEmpty);
      final changed = saved.copyWith(first: ' Анна ', email: '', birth: '', need: 'Новая');
      expect(changed.diff(saved), {'first_name': 'Анна', 'email': '', 'birth_date': null, 'prayer_request': 'Новая'});
      expect(saved.copyWith(first: ' ').validate(), 'Укажите имя');
      expect(saved.copyWith(email: 'без собаки').validate(), 'Проверьте адрес почты');
      expect(saved.copyWith(birth: '2999-01-01').validate(today: DateTime(2026, 1, 1)), 'Дата рождения не может быть в будущем');
      expect(saved.copyWith(birth: 'мусор').validate(), 'Проверьте дату рождения');
    });

    test('дата и списки служения', () {
      expect(birthLabel('1990-03-05'), '5 марта 1990');
      expect(birthLabel(''), 'Не указана');
      expect(splitMinistry('Ведущий; Музыкант, Проповедник '), ['Ведущий', 'Музыкант', 'Проповедник']);
      expect(splitMinistry(''), isEmpty);
    });

    test('профиль с сервера читает день рождения и почту', () {
      final u = AppUser.fromJson({'id': 1, 'name': 'А', 'first_name': 'А', 'last_name': 'Б', 'app_role': 'member', 'birth_date': '1990-03-05T00:00:00.000Z', 'email': ' a@b.ru '});
      expect(u.birthDate, '1990-03-05');
      expect(u.email, 'a@b.ru');
      expect(AppUser.fromJson(u.toJson()).birthDate, '1990-03-05');
    });
  });

  group('раздел «Ещё»', () {
    late _Launcher launcher;

    setUp(() {
      launcher = _Launcher();
      UrlLauncherPlatform.instance = launcher;
    });

    Future<void> open(WidgetTester tester, AppUser user, {double width = 360, double scale = 1, Future<int>? pending}) async {
      _size(tester, width);
      final s = _session(user);
      await tester.pumpWidget(_app(MorePage(pendingRequests: pending ?? Future.value(3)), s, width: width, scale: scale));
      await tester.pumpAndSettle();
    }

    testWidgets('участник: карточка профиля, группы разделов, аккаунт; админского блока нет', (tester) async {
      await open(tester, _user());
      expect(find.byKey(const ValueKey('more-profile')), findsOneWidget);
      expect(find.text('Мария Лис'), findsOneWidget);
      expect(find.text('СЛОВО'), findsOneWidget);
      expect(find.text('ЖИЗНЬ ЦЕРКВИ'), findsOneWidget);
      expect(find.text('Мероприятия'), findsOneWidget);
      expect(find.byKey(const ValueKey('admin-web')), findsNothing);
      expect(find.text('Для администраторов'.toUpperCase()), findsNothing);
      await tester.drag(find.byType(ListView), const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(find.text('Выйти из аккаунта'), findsOneWidget);
    });

    testWidgets('администратор: большая кнопка «Админка на сайте» открывает /admin', (tester) async {
      await open(tester, _user(role: 'admin'));
      await tester.dragUntilVisible(find.byKey(const ValueKey('admin-web')), find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();
      expect(find.text('Админка на сайте'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('admin-web')));
      await tester.pumpAndSettle();
      expect(launcher.opened.single, endsWith('/admin'));
    });

    testWidgets('администратор: «Заявки» со счётчиком и быстрые ссылки в нужные вкладки', (tester) async {
      await open(tester, _user(role: 'admin'));
      await tester.dragUntilVisible(find.byKey(const ValueKey('more-requests')), find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();
      expect(find.text('Ждут решения: 3'), findsOneWidget);
      await tester.dragUntilVisible(find.byKey(const ValueKey('admin-roles')), find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('admin-roles')));
      await tester.pumpAndSettle();
      expect(launcher.opened.single, endsWith('/admin?tab=roles'));
    });

    testWidgets('сбой счётчика заявок: общая подпись, ничего не падает', (tester) async {
      await open(tester, _user(role: 'admin'), pending: Future<int>.delayed(Duration.zero, () => throw StateError('нет сети')));
      await tester.dragUntilVisible(find.byKey(const ValueKey('more-requests')), find.byType(ListView), const Offset(0, -200));
      expect(find.text('Регистрация и сброс пароля'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('поиск: оставляет подходящие, прячет админку и аккаунт, «ничего нет»', (tester) async {
      await open(tester, _user(role: 'admin'));
      await tester.enterText(find.byKey(const ValueKey('more-search')), 'мероп');
      await tester.pumpAndSettle();
      expect(find.text('Мероприятия'), findsOneWidget);
      expect(find.text('Звонки'), findsNothing);
      expect(find.byKey(const ValueKey('admin-web')), findsNothing);
      await tester.enterText(find.byKey(const ValueKey('more-search')), 'ъъъ');
      await tester.pumpAndSettle();
      expect(find.text('Такого раздела нет'), findsOneWidget);
    });

    for (final (w, s) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('без переполнений: ширина $w, шрифт $s (админ)', (tester) async {
        await open(tester, _user(role: 'admin'), width: w, scale: s);
        expect(tester.takeException(), isNull);
        await tester.drag(find.byType(ListView), const Offset(0, -1500));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('профиль', () {
    Future<_FakeApi> open(WidgetTester tester, {AppUser? user, double width = 360, double scale = 1}) async {
      _size(tester, width, 900);
      final s = _session(user ?? _user(ministry: 'Ведущий; Проповедник', direction: 'Музыкальное служение', birth: '1990-03-05', email: 'a@b.ru'));
      final api = _FakeApi(s);
      await tester.pumpWidget(_app(ProfilePage(api: api, pushStatus: _FakeStatus()), s, width: width, scale: scale));
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('шапка, поля «О себе», служение только для чтения', (tester) async {
      await open(tester);
      expect(find.text('Мой профиль'), findsOneWidget);
      expect(find.text('+7 900 000-00-00'), findsOneWidget);
      expect(find.text('5 марта 1990'), findsOneWidget);
      expect(find.byKey(const ValueKey('profile-save')), findsNothing, reason: 'пока ничего не менялось');
      await tester.dragUntilVisible(find.byKey(const ValueKey('profile-ministry')), find.byType(ListView), const Offset(0, -200));
      expect(find.text('Ведущий, Проповедник'), findsWidgets);
      expect(find.text('Музыкальное служение'), findsOneWidget);
    });

    testWidgets('правка показывает «Сохранить», сохранение отправляет только изменённое', (tester) async {
      final api = await open(tester);
      await tester.enterText(find.byKey(const ValueKey('profile-first')), 'Анна');
      await tester.pump();
      expect(find.byKey(const ValueKey('profile-save')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(api.patches.single, {'first_name': 'Анна'});
      expect(find.byKey(const ValueKey('profile-save')), findsNothing);
      expect(find.text('Профиль сохранён'), findsOneWidget);
    });

    testWidgets('«Отменить» возвращает прежние значения', (tester) async {
      final api = await open(tester);
      await tester.enterText(find.byKey(const ValueKey('profile-last')), 'Другая');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('profile-discard')));
      await tester.pumpAndSettle();
      expect(find.text('Другая'), findsNothing);
      expect(find.byKey(const ValueKey('profile-save')), findsNothing);
      expect(api.patches, isEmpty);
    });

    testWidgets('неверная почта — ошибка, запроса нет', (tester) async {
      final api = await open(tester);
      await tester.enterText(_field('profile-email'), 'не-почта');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(find.text('Проверьте адрес почты'), findsOneWidget);
      expect(api.patches, isEmpty);
    });

    testWidgets('пустое имя — ошибка, запроса нет', (tester) async {
      final api = await open(tester);
      await tester.enterText(_field('profile-first'), '');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(find.text('Укажите имя'), findsOneWidget);
      expect(api.patches, isEmpty);
    });

    testWidgets('сбой сервера: текст ошибки, правки остаются', (tester) async {
      final api = await open(tester);
      api.fail = DioErrorLike();
      await tester.enterText(find.byKey(const ValueKey('profile-first')), 'Анна');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('profile-save')), findsOneWidget);
      expect(find.text('Анна'), findsWidgets);
    });

    testWidgets('убрать дату рождения', (tester) async {
      final api = await open(tester);
      await tester.tap(find.byTooltip('Убрать дату'));
      await tester.pump();
      expect(find.text('Не указана'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(api.patches.single, {'birth_date': null});
    });

    testWidgets('выход с несохранёнными правками спрашивает подтверждение', (tester) async {
      await open(tester);
      await tester.enterText(find.byKey(const ValueKey('profile-first')), 'Анна');
      await tester.pump();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Выйти без сохранения?'), findsOneWidget);
      await tester.tap(find.text('Остаться'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('profile-first')), findsOneWidget);
    });

    testWidgets('смена пароля раскрывается по нажатию', (tester) async {
      await open(tester);
      await tester.dragUntilVisible(find.byKey(const ValueKey('profile-password-toggle')), find.byType(ListView), const Offset(0, -200));
      expect(find.text('Текущий пароль'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('profile-password-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Текущий пароль'), findsOneWidget);
      expect(find.textContaining('Новый пароль', findRichText: true), findsOneWidget);
    });

    for (final (w, s) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('без переполнений: ширина $w, шрифт $s', (tester) async {
        await open(tester, width: w, scale: s);
        expect(tester.takeException(), isNull);
        await tester.enterText(find.byKey(const ValueKey('profile-first')), 'Анна');
        await tester.pump();
        await tester.drag(find.byType(ListView), const Offset(0, -2500));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}

/// Ошибка без сети: describeDio вернёт общий текст.
class DioErrorLike implements Exception {
  @override
  String toString() => 'ошибка';
}
