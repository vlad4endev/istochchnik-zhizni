import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/ui/kit/kit.dart';

/// Крупный системный шрифт (до 200%) не должен ломать строки списков и плитки.
void main() {
  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets('строка с бейджем и плитки при шрифте ${(scale * 100).round()}%', (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(
          data: MediaQueryData(size: const Size(360, 740), textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: ListView(padding: const EdgeInsets.all(16), children: [
              ListGroup(children: [
                ListRow(
                  title: 'Планёрка медиа-команды',
                  subtitle: 'Аудиозвонок · вчера',
                  meta: 'сб',
                  leading: const ChurchAvatar(name: 'Андрей Жуков'),
                  trailing: const StatusPill('Пропущен', tone: Tone.red),
                  onTap: () {},
                ),
                ListRow(title: 'Режиссёр', trailing: const StatusPill('Подтверждено', tone: Tone.green)),
              ]),
              const SizedBox(height: 12),
              TileGrid(children: [
                for (final l in ['Мероприятия', 'Моя нужда', 'Проповеди']) FeatureTile(icon: Icons.event, label: l, onTap: () {}, centered: true),
              ]),
            ]),
          ),
        ),
      ));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }
}
