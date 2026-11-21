import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/ui/kit/kit.dart';

const _items = [
  NavItem(label: 'Главная', icon: Icons.dashboard_outlined, activeIcon: Icons.dashboard_rounded),
  NavItem(label: 'Молитва', icon: Icons.church_outlined, activeIcon: Icons.church_rounded),
  NavItem(label: 'Лента', icon: Icons.article_outlined, activeIcon: Icons.article_rounded),
  NavItem(label: 'Чаты', icon: Icons.chat_bubble_outline_rounded, activeIcon: Icons.chat_bubble_rounded, badge: 2),
  NavItem(label: 'Ещё', icon: Icons.more_horiz_rounded, activeIcon: Icons.more_horiz_rounded),
];

Widget _app({double width = 360, double scale = 1, Brightness b = Brightness.light, int index = 3, ValueChanged<int>? onSelect}) => MaterialApp(
      theme: churchTheme(brightness: b),
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 700), textScaler: TextScaler.linear(scale)),
        child: Scaffold(body: const SizedBox.expand(), bottomNavigationBar: ChurchBottomNav(items: _items, index: index, onSelect: onSelect ?? (_) {})),
      ),
    );

void main() {
  for (final (w, s, b) in [(320.0, 1.0, Brightness.light), (320.0, 2.0, Brightness.light), (360.0, 1.3, Brightness.dark), (768.0, 1.0, Brightness.light)]) {
    testWidgets('панель вкладок без переполнений: ширина $w, шрифт $s, $b', (tester) async {
      tester.view.physicalSize = Size(w, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_app(width: w, scale: s, b: b));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final item in _items) {
        expect(find.text(item.label), findsOneWidget);
      }
      final h = tester.getSize(find.byType(ChurchBottomNav)).height;
      expect(h, lessThan(130));
    });
  }

  testWidgets('нажатие выбирает вкладку, цель касания ≥ 44 px, бейдж читается', (tester) async {
    tester.view.physicalSize = const Size(360, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    int? picked;
    final sem = tester.ensureSemantics();
    await tester.pumpWidget(_app(onSelect: (i) => picked = i));
    await tester.tap(find.text('Лента'));
    expect(picked, 2);
    final size = tester.getSize(find.ancestor(of: find.text('Лента'), matching: find.byType(InkWell)).first);
    expect(size.height, greaterThanOrEqualTo(44));
    expect(find.bySemanticsLabel('Чаты, непрочитанных 2'), findsOneWidget);
    sem.dispose();
  });

  testWidgets('картинка для визуальной проверки', (tester) async {
    final out = Platform.environment['NAV_SHOT'];
    if (out == null) return;
    for (final f in ['assets/fonts/Onest-Regular.ttf', 'assets/fonts/Onest-Medium.ttf', 'assets/fonts/Onest-SemiBold.ttf']) {
      final l = FontLoader('Onest')..addFont(Future.value(ByteData.sublistView(File(f).readAsBytesSync())));
      await l.load();
    }
    final l = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('/root/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync())));
    await l.load();
    tester.view.physicalSize = const Size(780, 220);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    for (final b in [Brightness.light, Brightness.dark]) {
      final key = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(key: key, child: _app(width: 390, b: b)));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final image = await (key.currentContext!.findRenderObject()! as RenderRepaintBoundary).toImage(pixelRatio: 1);
        File('$out/nav_${b.name}.png').writeAsBytesSync((await image.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List());
      });
    }
  });
}
