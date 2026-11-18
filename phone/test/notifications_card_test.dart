import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/push_status.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/profile/notifications_card.dart';

class _FakeStatus extends PushStatus {
  _FakeStatus({super.supported}) : super.test();
  int notificationSettingsOpened = 0;
  int fullScreenOpened = 0;

  @override
  Future<void> refresh() async {}

  @override
  Future<void> openNotificationSettings() async => notificationSettingsOpened++;

  @override
  Future<void> openFullScreenSettings() async => fullScreenOpened++;
}

Future<void> _pump(WidgetTester tester, PushStatus status, {double scale = 1}) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: churchTheme(brightness: Brightness.light),
    home: MediaQuery(
      data: MediaQueryData(size: const Size(360, 740), textScaler: TextScaler.linear(scale)),
      child: Scaffold(body: ListView(padding: const EdgeInsets.all(16), children: [NotificationsCard(status: status)])),
    ),
  ));
}

void main() {
  testWidgets('всё включено: три зелёные строки и нет кнопок', (tester) async {
    final status = _FakeStatus()
      ..notificationsAllowed = true
      ..fullScreenAllowed = true
      ..tokenRegistered = true;
    await _pump(tester, status);
    expect(find.text('Включены'), findsOneWidget);
    expect(find.text('Устройство зарегистрировано'), findsOneWidget);
    expect(find.text('Включить'), findsNothing);
    expect(find.textContaining('Исправьте отмеченное'), findsNothing);
  });

  for (final scale in [1.0, 2.0]) {
    testWidgets('выключено: объясняет причину и открывает настройки (шрифт ${(scale * 100).round()}%)', (tester) async {
      final status = _FakeStatus()
        ..notificationsAllowed = false
        ..fullScreenAllowed = false
        ..tokenRegistered = false;
      await _pump(tester, status, scale: scale);
      expect(tester.takeException(), isNull);
      expect(find.textContaining('сообщения и звонки не придут'), findsOneWidget);

      await tester.tap(find.text('Включить'));
      await tester.tap(find.text('Разрешить'));
      expect(status.notificationSettingsOpened, 1);
      expect(status.fullScreenOpened, 1);
    });
  }

  testWidgets('проблема Firebase показывается как причина', (tester) async {
    final status = _FakeStatus()
      ..notificationsAllowed = true
      ..fullScreenAllowed = true
      ..setFirebaseProblem('Не удалось связаться с Firebase');
    await _pump(tester, status);
    expect(find.text('Не удалось связаться с Firebase'), findsOneWidget);
  });

  testWidgets('на платформе без пушей блока нет', (tester) async {
    await _pump(tester, _FakeStatus(supported: false));
    expect(find.text('Уведомления и звонки'), findsNothing);
  });
}
