import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:provider/provider.dart';

void main() {
  for (final (width, scale) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
    testWidgets('шапка «Чаты»: видео, аудио, новый чат — ширина $width, шрифт $scale', (tester) async {
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
      expect(find.byTooltip('Видеовстреча'), findsOneWidget);
      expect(find.byTooltip('Аудиовстреча'), findsOneWidget);
      expect(find.byTooltip('Новое сообщение'), findsOneWidget);
      await tester.tap(find.byTooltip('Видеовстреча'));
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.text('Создать видеовстречу'), findsWidgets);
      expect(find.byKey(const ValueKey('meeting-cam')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
