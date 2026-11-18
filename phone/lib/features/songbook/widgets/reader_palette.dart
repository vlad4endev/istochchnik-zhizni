import 'package:material_ui/material_ui.dart';

import '../reader_controller.dart';

/// Цвета читалки. «Чёрная» взята из макета, «Тёмная» мягче, «Светлая» — как лист бумаги.
@immutable
class ReaderPalette {
  const ReaderPalette({
    required this.brightness,
    required this.bg,
    required this.surface,
    required this.sheet,
    required this.card,
    required this.text,
    required this.secondary,
    required this.muted,
    required this.chord,
    required this.accent,
    required this.onAccent,
    required this.badge,
    required this.border,
    required this.track,
  });

  final Brightness brightness;
  final Color bg;
  final Color surface;
  final Color sheet;
  final Color card;
  final Color text;
  final Color secondary;
  final Color muted;
  final Color chord;
  final Color accent;
  final Color onAccent;
  final Color badge;
  final Color border;
  final Color track;

  bool get isDark => brightness == Brightness.dark;

  Color get chordRule => chord.withValues(alpha: 0.4);

  static const _black = ReaderPalette(
    brightness: Brightness.dark,
    bg: Color(0xFF0B0B0D),
    surface: Color(0xFF1E1E22),
    sheet: Color(0xFF131316),
    card: Color(0xFF151518),
    text: Color(0xFFE9E5DD),
    secondary: Color(0xFFBDB7AD),
    muted: Color(0xFF938E86),
    chord: Color(0xFFE8B35F),
    accent: Color(0xFFE8B35F),
    onAccent: Color(0xFF1A1205),
    badge: Color(0xFF2A2216),
    border: Color(0x12FFFFFF),
    track: Color(0xFF2A2A2F),
  );

  static const _dark = ReaderPalette(
    brightness: Brightness.dark,
    bg: Color(0xFF1C1B21),
    surface: Color(0xFF2A2931),
    sheet: Color(0xFF232228),
    card: Color(0xFF28272E),
    text: Color(0xFFECE7DF),
    secondary: Color(0xFFC4BEB5),
    muted: Color(0xFFA29C93),
    chord: Color(0xFFF0BE6E),
    accent: Color(0xFFF0BE6E),
    onAccent: Color(0xFF1A1205),
    badge: Color(0xFF3A2D18),
    border: Color(0x14FFFFFF),
    track: Color(0xFF3A3942),
  );

  static const _light = ReaderPalette(
    brightness: Brightness.light,
    bg: Color(0xFFFBF6EF),
    surface: Color(0xFFFFFFFF),
    sheet: Color(0xFFFBF6EF),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF2B1A1D),
    secondary: Color(0xFF5A4A4C),
    muted: Color(0xFF76625F),
    chord: Color(0xFF8A2742),
    accent: Color(0xFF8A2742),
    onAccent: Color(0xFFFFFFFF),
    badge: Color(0xFFF3E6E4),
    border: Color(0x1F5A1826),
    track: Color(0xFFE6DDD3),
  );

  static ReaderPalette of(ReaderTheme theme) => switch (theme) {
        ReaderTheme.black => _black,
        ReaderTheme.dark => _dark,
        ReaderTheme.light => _light,
      };
}
