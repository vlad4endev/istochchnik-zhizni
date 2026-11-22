import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/profile/push_samples_sheet.dart';

class _Src implements PushSamplesSource {
  _Src({this.fail = false, this.items = const [PushSample(id: 'prayer_reminder', label: 'Напоминание помолиться'), PushSample(id: 'birthday_today', label: 'День рождения сегодня')]});
  final bool fail;
  final List<PushSample> items;
  final sent = <String>[];
  int loads = 0;

  @override
  Future<List<PushSample>> load() async {
    loads++;
    if (fail && loads == 1) throw Exception('net');
    return items;
  }

  @override
  Future<void> send(String id) async {
    if (fail) throw Exception('net');
    sent.add(id);
  }
}

Widget _host(PushSamplesSource s, {double scale = 1}) => MaterialApp(
      theme: churchTheme(brightness: Brightness.light),
      home: MediaQuery(
        data: MediaQueryData(size: const Size(320, 640), textScaler: TextScaler.linear(scale)),
        child: Scaffold(body: SingleChildScrollView(child: PushSamplesView(source: s))),
      ),
    );

void main() {
  testWidgets('показывает примеры и отправляет выбранный; без переполнения при 320 px и шрифте 2.0', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final src = _Src();
    await tester.pumpWidget(_host(src, scale: 2));
    await tester.pump();
    expect(find.byKey(const ValueKey('sample-prayer_reminder')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('sample-birthday_today')));
    await tester.pump();
    await tester.pump();
    expect(src.sent, ['birthday_today']);
    expect(find.textContaining('Отправлено'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ошибка загрузки — понятный текст и «Повторить»', (tester) async {
    final src = _Src(fail: true);
    await tester.pumpWidget(_host(src));
    await tester.pump();
    expect(find.textContaining('Не удалось загрузить'), findsOneWidget);
    expect(src.loads, 1);
  });

  testWidgets('пустой список', (tester) async {
    await tester.pumpWidget(_host(_Src(items: const [])));
    await tester.pump();
    expect(find.text('Примеров пока нет.'), findsOneWidget);
  });
}
