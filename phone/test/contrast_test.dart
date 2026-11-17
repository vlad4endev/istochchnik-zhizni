import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/ui/kit/tokens.dart';

double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

/// WCAG 2.2 AA: текст ≥4.5:1, значки ≥3:1.
void main() {
  for (final (name, palette) in [('светлая', ChurchPalette.light), ('тёмная', ChurchPalette.dark)]) {
    test('текст листа читается: $name тема', () {
      for (final bg in [palette.sheet, palette.card]) {
        expect(contrast(palette.ink, bg), greaterThanOrEqualTo(4.5));
        expect(contrast(palette.inkMuted, bg), greaterThanOrEqualTo(4.5));
        expect(contrast(palette.inkFaint, bg), greaterThanOrEqualTo(4.5), reason: 'время, даты, подсказки');
        expect(contrast(palette.accent, bg), greaterThanOrEqualTo(4.5), reason: 'подписи разделов');
        expect(contrast(palette.chevron, bg), greaterThanOrEqualTo(3.0), reason: 'шевроны');
      }
    });

    test('текст бейджей читается: $name тема', () {
      for (final tone in Tone.values) {
        // В тёмной теме фон бейджа полупрозрачный — считаем его поверх карточки.
        final bg = Color.alphaBlend(tone.bg(palette), palette.card);
        expect(contrast(tone.text(palette), bg), greaterThanOrEqualTo(4.5), reason: 'бейдж ${tone.name}');
      }
    });
  }
}
