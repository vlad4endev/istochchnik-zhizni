import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/calls/call_page.dart';
import 'package:molitva/core/call_alerts.dart';
import 'package:molitva/features/calls/logic/call_access.dart';
import 'package:provider/provider.dart';

class _Gate implements CallPermissionGate {
  _Gate(this.mic);
  final Access mic;
  int asked = 0;
  int settings = 0;

  @override
  Future<({Access mic, Access cam})> request({required bool camera}) async {
    asked++;
    return (mic: mic, cam: Access.granted);
  }

  @override
  Future<void> openSettings() async => settings++;
}

void main() {
  for (final (w, h, s) in [(320.0, 568.0, 1.0), (320.0, 568.0, 2.0), (390.0, 844.0, 1.3), (360.0, 640.0, 1.0)]) {
    testWidgets('входящий звонок в приложении: ширина $w×$h, шрифт $s — без переполнений', (tester) async {
      tester.view.physicalSize = Size(w, h);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final session = SessionController();
      // Комната LiveKit заводит таймер при создании — строим экран вне «поддельного» времени теста.
      await tester.runAsync(() => tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.dark),
          home: MediaQuery(data: MediaQueryData(size: Size(w, h), textScaler: TextScaler.linear(s)), child: const CallPage(callId: 'c1', incoming: true, video: true, title: 'Анна Орлова-Сидорова из молодёжной группы')),
        ),
      )));
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.takeException(), isNull);
      expect(find.text('ВХОДЯЩИЙ ВИДЕОЗВОНОК'), findsOneWidget);
      expect(find.text('МОЯ ЦЕРКОВЬ'), findsOneWidget);
      expect(find.text('Ответить'), findsOneWidget);
      expect(find.text('Отклонить'), findsOneWidget);
      await tester.runAsync(() => tester.pumpWidget(const SizedBox()));
    });
  }

  for (final (mic, expectSettings) in [(Access.denied, false), (Access.blocked, true)]) {
    testWidgets('«Ответить» без микрофона ($mic): понятная причина, ${expectSettings ? 'кнопка «Настройки»' : 'можно повторить'}', (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final gate = _Gate(mic);
      await tester.runAsync(() => tester.pumpWidget(ChangeNotifierProvider.value(
            value: SessionController(),
            child: MaterialApp(theme: churchTheme(brightness: Brightness.dark), home: CallPage(callId: 'c1', incoming: true, title: 'Анна', permissions: gate)),
          )));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Звонит вам…'), findsOneWidget);
      await tester.tap(find.text('Ответить'));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
      expect(gate.asked, 1);
      expect(find.textContaining('икрофон'), findsWidgets);
      expect(find.text('Повторить'), findsOneWidget);
      expect(find.text('Настройки'), expectSettings ? findsOneWidget : findsNothing);
      await tester.runAsync(() => tester.pumpWidget(const SizedBox()));
    });
  }

  test('параметры системной звонилки: фирменные ресурсы, тип звонка, ответить/отклонить', () {
    const invite = CallInvite(callId: 'c1', callerName: 'Анна', video: true);
    final p = invite.toParams();
    expect(p.appName, 'Моя церковь');
    expect(p.handle, 'Видеозвонок');
    expect(p.avatar, 'assets/images/logo.png', reason: 'без фото — логотип церкви');
    expect(p.android!.backgroundUrl, 'assets/call/call_background.png');
    expect(p.android!.isShowLogo, isTrue);
    expect(p.android!.isShowCallID, isTrue, reason: 'без этого подпись «Видеозвонок» скрыта');
    expect(p.android!.textAccept, 'Ответить');
    expect(const CallInvite(callId: 'c2', callerName: 'Пётр', video: false, callerAvatar: 'https://x/a.jpg').toParams().avatar, 'https://x/a.jpg');
    expect(const CallInvite(callId: 'c3', callerName: 'Пётр', video: false).toParams().handle, 'Аудиозвонок');
  });
}
