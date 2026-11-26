import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/features/shell/restore_cover.dart';

void main() {
  Widget host(ValueNotifier<bool> restoring) => MaterialApp(
        home: RestoreGate(restoring: restoring, child: const Scaffold(body: Text('Главная'))),
      );

  testWidgets('после выбора файла экран закрыт заставкой цвета запуска, пока чат не открыт', (tester) async {
    final restoring = ValueNotifier(true);
    await tester.pumpWidget(host(restoring));
    final cover = find.byKey(const Key('restore-cover'));
    expect(cover, findsOneWidget);
    final box = tester.widget<ColoredBox>(find.descendant(of: cover, matching: find.byType(ColoredBox)));
    expect(box.color, restoreCoverColor);

    restoring.value = false;
    await tester.pump();
    expect(cover, findsNothing);
    expect(find.text('Главная'), findsOneWidget);
  });

  testWidgets('обычный запуск: заставки нет', (tester) async {
    await tester.pumpWidget(host(ValueNotifier(false)));
    expect(find.byKey(const Key('restore-cover')), findsNothing);
  });
}
