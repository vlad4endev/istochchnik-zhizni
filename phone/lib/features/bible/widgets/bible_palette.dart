import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../songbook/reader_controller.dart' show ReaderTheme;
import '../../songbook/widgets/reader_palette.dart';
import '../bible_store.dart';

/// Палитра читалки Библии. «Как в приложении» следует за светлой или тёмной темой телефона.
ReaderPalette biblePaletteFor(BibleTheme theme, Brightness app) => switch (theme) {
      BibleTheme.auto => ReaderPalette.of(app == Brightness.dark ? ReaderTheme.dark : ReaderTheme.light),
      BibleTheme.light => ReaderPalette.of(ReaderTheme.light),
      BibleTheme.dark => ReaderPalette.of(ReaderTheme.dark),
      BibleTheme.black => ReaderPalette.of(ReaderTheme.black),
    };

/// Цвета плиток выбора книги и главы: одни и те же виджеты работают и на экране приложения, и в читалке.
class PickerColors {
  const PickerColors({
    required this.sheet,
    required this.tile,
    required this.text,
    required this.muted,
    required this.accent,
    required this.onAccent,
    required this.border,
    required this.newTestament,
    required this.oldTestament,
  });

  final Color sheet;
  final Color tile;
  final Color text;
  final Color muted;
  final Color accent;
  final Color onAccent;
  final Color border;
  final Color newTestament;
  final Color oldTestament;

  factory PickerColors.fromReader(ReaderPalette p) => PickerColors(
        sheet: p.sheet,
        tile: p.surface,
        text: p.text,
        muted: p.muted,
        accent: p.accent,
        onAccent: p.onAccent,
        border: p.border,
        newTestament: p.accent,
        oldTestament: p.secondary,
      );

  factory PickerColors.fromChurch(ChurchPalette p) => PickerColors(
        sheet: p.sheet,
        tile: p.card,
        text: p.ink,
        muted: p.inkMuted,
        accent: p.accent,
        onAccent: p.isDark ? ChurchColors.amberInk : Colors.white,
        border: p.outline,
        newTestament: Tone.wine.fg(p),
        oldTestament: Tone.amber.fg(p),
      );
}
