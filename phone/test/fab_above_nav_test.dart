import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/ui/kit/kit.dart';

/// Кнопка «+» на странице внутри оболочки с нижним меню не должна уходить под меню.
void main() {
  Future<void> open(WidgetTester tester, {double width = 360, double height = 800, double bottomInset = 0, double scale = 1}) async {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = FakeViewPadding(bottom: bottomInset);
    tester.view.viewPadding = FakeViewPadding(bottom: bottomInset);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: churchTheme(brightness: Brightness.light),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      home: Scaffold(
        extendBody: true,
        body: ChurchPage(
          title: 'Главная',
          floatingActionButton: ChurchFab(circle: true, tooltip: 'Добавить', onPressed: () {}),
          body: ListView(children: const [SizedBox(height: 1200)]),
        ),
        bottomNavigationBar: ChurchBottomNav(
          items: const [
            NavItem(label: 'Главная', icon: Icons.home_outlined, activeIcon: Icons.home_rounded),
            NavItem(label: 'Чаты', icon: Icons.chat_bubble_outline_rounded, activeIcon: Icons.chat_bubble_rounded),
          ],
          index: 0,
          onSelect: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  for (final c in [(360.0, 800.0, 0.0, 1.0), (360.0, 800.0, 34.0, 1.0), (320.0, 568.0, 0.0, 2.0)]) {
    testWidgets('кнопка «+» выше нижнего меню: ${c.$1.toInt()}×${c.$2.toInt()}, отступ ${c.$3.toInt()}, шрифт ${c.$4}', (tester) async {
      await open(tester, width: c.$1, height: c.$2, bottomInset: c.$3, scale: c.$4);
      final fab = tester.getRect(find.byType(ChurchFab));
      final nav = tester.getRect(find.byType(ChurchBottomNav));
      expect(fab.bottom, lessThanOrEqualTo(nav.top), reason: 'кнопка ${fab.bottom} должна быть выше меню ${nav.top}');
      expect(fab.right, lessThanOrEqualTo(c.$1));
    });
  }
}
