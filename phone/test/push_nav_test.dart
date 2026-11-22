import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/nav.dart';
import 'package:molitva/core/push_nav.dart';
import 'package:molitva/core/push_route.dart';
import 'package:molitva/core/session.dart';

SessionController _session({bool loggedIn = true}) {
  final s = SessionController();
  if (loggedIn) s.user = AppUser(id: 1, name: 'Мария', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

void main() {
  final nav = PushNavigator.instance;

  setUp(() {
    nav.requestedTab = null;
    nav.shellGone();
  });

  Future<void> app(WidgetTester tester) => tester.pumpWidget(MaterialApp(navigatorKey: navigatorKey, home: const Scaffold(body: Text('главная'))));

  testWidgets('вкладка из пуша: молитва, лента, главная', (tester) async {
    await app(tester);
    nav.attach(_session());
    nav.shellReady();
    var calls = 0;
    nav.addListener(() => calls++);
    nav.open(const PushTarget(PushDestination.prayer));
    expect(nav.requestedTab, 'prayer');
    nav.open(const PushTarget(PushDestination.feed));
    expect(nav.requestedTab, 'feed');
    nav.open(const PushTarget(PushDestination.home));
    expect(nav.requestedTab, 'home');
    expect(calls, 3);
  });

  testWidgets('«нет назначения» приложение не трогает', (tester) async {
    await app(tester);
    nav.attach(_session());
    nav.shellReady();
    nav.open(const PushTarget(PushDestination.none));
    expect(nav.requestedTab, isNull);
  });

  testWidgets('пуш нажали до готовности вкладок — выполняется, когда оболочка построена', (tester) async {
    await app(tester);
    nav.attach(_session());
    nav.open(const PushTarget(PushDestination.prayer));
    expect(nav.requestedTab, isNull, reason: 'оболочка ещё не готова — запомнили');
    nav.shellReady();
    expect(nav.requestedTab, 'prayer');
    nav.requestedTab = null;
    nav.shellReady();
    expect(nav.requestedTab, isNull, reason: 'второй раз то же самое не выполняется');
  });

  testWidgets('не вошли в аккаунт — переход ждёт', (tester) async {
    await app(tester);
    nav.attach(_session(loggedIn: false));
    nav.shellReady();
    nav.open(const PushTarget(PushDestination.feed));
    expect(nav.requestedTab, isNull);
  });

  testWidgets('нет доступа к разделу — ведём на главную, а не в закрытый раздел', (tester) async {
    await app(tester);
    final s = _session();
    s.sections['studio'] = const SectionRule(enabled: false, roles: []);
    nav.attach(s);
    nav.shellReady();
    nav.open(const PushTarget(PushDestination.studio));
    expect(nav.requestedTab, 'home');
  });
}
