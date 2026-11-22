import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/attachment_diagnostics_page.dart';
import 'package:molitva/features/chats/data/attachment_picker.dart';

import 'fake_chat.dart';

void main() {
  test('probePicker описывает выбор, пустой выбор, ошибку приложения и неожиданный сбой', () async {
    expect((await probePicker('Галерея', () async => [1, 2])).outcome, 'выбрано файлов: 2');
    expect((await probePicker('Галерея', () async => <int>[])).outcome, contains('ничего не выбрано'));
    expect((await probePicker('Видео', () async => null)).outcome, contains('ничего не выбрано'));
    expect((await probePicker('Камера', () async => throw const PickerException('Нет доступа к камере'))).outcome, contains('Нет доступа к камере'));
    final crash = await probePicker('Файл', () async => throw StateError('boom'));
    expect(crash.outcome, contains('StateError'));
    expect(crash.line, contains('Файл'));
  });

  testWidgets('экран: кнопка запускает проверку и показывает итог; повторное нажатие во время проверки игнорируется', (tester) async {
    final picker = FakePicker()..error = const PickerException('Не удалось открыть выбор (фото, код: x)');
    await tester.pumpWidget(MaterialApp(home: AttachmentDiagnosticsPage(picker: picker)));
    await tester.tap(find.byKey(const ValueKey('probe-gallery')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Не удалось открыть выбор (фото, код: x)'), findsOneWidget);
    expect(find.byKey(const ValueKey('probe-copy')), findsOneWidget);
  });
}
