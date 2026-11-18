import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/features/songbook/logic/song_format.dart';
import 'package:molitva/features/songbook/reader_controller.dart';
import 'package:molitva/features/songbook/widgets/reader_palette.dart';
import 'package:molitva/features/songbook/widgets/song_text.dart';

const _raw = '''
{sec:Куплет 1}
[A]Проходит ночь, и [E]восходит солнце, пора воспеть
[H]Сверхдлинноеслововбезпробеловдлявыявленияпереполнения[C#m] и хвост
{sec:Припев}
[A]Бога [E]благослови, о, [H/D#]душа моя
''';

/// Строки с аккордами должны переноситься и не вылезать за экран ни на узком экране, ни при крупном шрифте.
void main() {
  for (final width in [320.0, 360.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('текст песни: ширина ${width.round()}, системный шрифт ${(scale * 100).round()}%', (tester) async {
        tester.view.physicalSize = Size(width, 740);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final controller = ScrollController();
        addTearDown(controller.dispose);

        await tester.pumpWidget(MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
            child: Scaffold(
              body: SongText(
                blocks: parseSong(_raw).blocks,
                palette: ReaderPalette.of(ReaderTheme.black),
                fontSize: 34,
                showChords: true,
                controller: controller,
              ),
            ),
          ),
        ));

        expect(tester.takeException(), isNull);
        expect(find.textContaining('Проходит'), findsWidgets);
      });
    }
  }

  testWidgets('без аккордов показывается только текст', (tester) async {
    final controller = ScrollController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SongText(
          blocks: parseSong(_raw).blocks,
          palette: ReaderPalette.of(ReaderTheme.light),
          fontSize: 20,
          showChords: false,
          controller: controller,
        ),
      ),
    ));
    expect(find.text('H/D#'), findsNothing);
    expect(find.textContaining('душа моя'), findsWidgets);
  });
}
