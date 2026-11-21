import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:provider/provider.dart';

void main() {
  for (final (width, scale) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
    testWidgets('шапка «Чаты»: одна кнопка «Конференция» и новый чат — ширина $width, шрифт $scale', (tester) async {
      tester.view.physicalSize = Size(width, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = SessionController();
      s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: s,
          child: MaterialApp(
            theme: churchTheme(brightness: Brightness.light),
            home: MediaQuery(data: MediaQueryData(size: Size(width, 700), textScaler: TextScaler.linear(scale)), child: const ChatsPage()),
          ),
        ),
      );
      await tester.pump();
      expect(find.byTooltip('Конференция'), findsOneWidget, reason: 'одна кнопка вместо трёх');
      expect(find.byTooltip('Видеовстреча'), findsNothing);
      expect(find.byTooltip('Аудиовстреча'), findsNothing);
      expect(find.byTooltip('Войти по ссылке'), findsNothing);
      expect(find.byTooltip('Новое сообщение'), findsOneWidget);
      await tester.tap(find.byTooltip('Конференция'));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      expect(find.byKey(const ValueKey('meeting-kind-video')), findsOneWidget);
      expect(find.byKey(const ValueKey('meeting-kind-audio')), findsOneWidget);
      expect(find.byKey(const ValueKey('meeting-kind-join')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('meeting-kind-video')));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(find.text('Создать видеовстречу'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }
}
