import 'package:material_ui/material_ui.dart';

/// Токены дизайна «Моя церковь». Значения сняты с макетов в `mobile/*.dc.html`.
abstract final class ChurchColors {
  /// Фон под шапкой и тёмные экраны.
  static const night = Color(0xFF230810);
  static const nightDeep = Color(0xFF1E0710);
  static const nightBar = Color(0xD11E0710);

  /// Акцентное вино — кнопки, активные сегменты, подписи разделов.
  static const wine = Color(0xFF8A2742);
  static const wineDark = Color(0xFF5A1826);
  static const wineDeep = Color(0xFF4A1224);
  static const wineBlob = Color(0xFF8A2342);

  /// Тёплый янтарь — активная вкладка, акценты на тёмном.
  static const amber = Color(0xFFF2B879);
  static const amberBlob = Color(0xFFF0A25A);
  static const amberInk = Color(0xFF4B1620);

  static const badge = Color(0xFFFF5C7A);
  static const danger = Color(0xFFC0304F);
  static const success = Color(0xFF1E8A4C);
  static const successBright = Color(0xFF2FBF71);

  static const cream = Color(0xFFFBF6EF);
  static const creamButton = Color(0xFFFFF6EA);
}

/// Отступы — сетка 4 px.
abstract final class Space {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
}

abstract final class Radii {
  static const sm = 12.0;
  static const md = 14.0;
  static const lg = 16.0;
  static const xl = 18.0;
  static const card = 20.0;
  static const sheet = 30.0;
}

abstract final class Motion {
  static const fast = Duration(milliseconds: 160);
  static const normal = Duration(milliseconds: 240);
}

const wineGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [ChurchColors.wine, ChurchColors.wineDark],
);

const crossTileGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [ChurchColors.wineDeep, Color(0xFF220810)],
);

/// Цвета листа и карточек. Шапка тёмная в обеих темах, меняется только лист.
@immutable
class ChurchPalette extends ThemeExtension<ChurchPalette> {
  const ChurchPalette({
    required this.sheet,
    required this.card,
    required this.ink,
    required this.inkMuted,
    required this.inkFaint,
    required this.chevron,
    required this.hairline,
    required this.outline,
    required this.accent,
    required this.accentSoft,
    required this.field,
    required this.shadow,
    required this.isDark,
  });

  final Color sheet;
  final Color card;
  final Color ink;
  final Color inkMuted;
  final Color inkFaint;
  final Color chevron;
  final Color hairline;
  final Color outline;

  /// Цвет подписей разделов и вторичных кнопок.
  final Color accent;
  final Color accentSoft;
  final Color field;
  final Color shadow;
  final bool isDark;

  static const light = ChurchPalette(
    sheet: ChurchColors.cream,
    card: Colors.white,
    ink: Color(0xFF3A1018),
    inkMuted: Color(0xFF6A5555),
    inkFaint: Color(0xFF8A7774),
    chevron: Color(0xFFB09A97),
    hairline: Color(0x125A1826),
    outline: Color(0x245A1826),
    accent: ChurchColors.wine,
    accentSoft: Color(0xFFF3E6E4),
    field: Colors.white,
    shadow: Color(0x0F5A1826),
    isDark: false,
  );

  static const dark = ChurchPalette(
    sheet: Color(0xFF170A0F),
    card: Color(0xFF241218),
    ink: Color(0xFFF7ECE8),
    inkMuted: Color(0xFFC9B4B0),
    inkFaint: Color(0xFFA08E8B),
    chevron: Color(0xFF8C7774),
    hairline: Color(0x1AFFFFFF),
    outline: Color(0x29FFFFFF),
    accent: ChurchColors.amber,
    accentSoft: Color(0xFF3A1C24),
    field: Color(0xFF2C161D),
    shadow: Color(0x40000000),
    isDark: true,
  );

  List<BoxShadow> get cardShadow => isDark
      ? const []
      : [
          const BoxShadow(color: Color(0x0D5A1826), offset: Offset(0, 1)),
          BoxShadow(color: shadow, offset: const Offset(0, 8), blurRadius: 22),
        ];

  @override
  ChurchPalette copyWith({Color? sheet, Color? card, Color? ink}) => ChurchPalette(
        sheet: sheet ?? this.sheet,
        card: card ?? this.card,
        ink: ink ?? this.ink,
        inkMuted: inkMuted,
        inkFaint: inkFaint,
        chevron: chevron,
        hairline: hairline,
        outline: outline,
        accent: accent,
        accentSoft: accentSoft,
        field: field,
        shadow: shadow,
        isDark: isDark,
      );

  @override
  ChurchPalette lerp(ChurchPalette? other, double t) {
    if (other == null) return this;
    return ChurchPalette(
      sheet: Color.lerp(sheet, other.sheet, t)!,
      card: Color.lerp(card, other.card, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkMuted: Color.lerp(inkMuted, other.inkMuted, t)!,
      inkFaint: Color.lerp(inkFaint, other.inkFaint, t)!,
      chevron: Color.lerp(chevron, other.chevron, t)!,
      hairline: Color.lerp(hairline, other.hairline, t)!,
      outline: Color.lerp(outline, other.outline, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      field: Color.lerp(field, other.field, t)!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
      isDark: t < 0.5 ? isDark : other.isDark,
    );
  }
}

extension ChurchPaletteContext on BuildContext {
  ChurchPalette get palette => Theme.of(this).extension<ChurchPalette>() ?? ChurchPalette.light;
}

/// Пастельные пары «фон плитки / цвет иконки» из макета.
enum Tone {
  rose(Color(0xFFF6E3EA), Color(0xFFB23A58)),
  green(Color(0xFFE3F3E8), Color(0xFF1E8A4C)),
  amber(Color(0xFFFBE9D6), Color(0xFFC0792E)),
  violet(Color(0xFFECE9FB), Color(0xFF6B5BE0)),
  teal(Color(0xFFDDF1F0), Color(0xFF12756F)),
  red(Color(0xFFFCE4E8), Color(0xFFC0304F)),
  wine(Color(0xFFF3E6E4), Color(0xFF8A2742)),
  neutral(Color(0xFFEDE6DE), Color(0xFF6A5555));

  const Tone(this.background, this.foreground);
  final Color background;
  final Color foreground;

  Color bg(ChurchPalette palette) => palette.isDark ? foreground.withValues(alpha: 0.22) : background;

  Color fg(ChurchPalette palette) =>
      palette.isDark ? Color.lerp(foreground, Colors.white, 0.45)! : foreground;
}

/// Типографика: Onest для интерфейса, Playfair Display Italic для акцентных заголовков.
abstract final class ChurchType {
  static const family = 'Onest';
  static const serif = 'Playfair Display';

  static const headerTitle = TextStyle(
    fontFamily: family,
    fontSize: 23,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.46,
    height: 1.15,
    color: Colors.white,
  );

  static const headerSubtitle = TextStyle(
    fontFamily: family,
    fontSize: 12.5,
    height: 1.3,
    color: Color(0xB8FFFFFF),
  );

  static const sectionLabel = TextStyle(
    fontFamily: family,
    fontSize: 11.5,
    fontWeight: FontWeight.w700,
    letterSpacing: 1.15,
  );

  static const title = TextStyle(fontFamily: family, fontSize: 15.5, fontWeight: FontWeight.w700, height: 1.25);
  static const body = TextStyle(fontFamily: family, fontSize: 14.5, height: 1.45);
  static const caption = TextStyle(fontFamily: family, fontSize: 12.5, height: 1.35);
  static const serifTitle = TextStyle(
    fontFamily: serif,
    fontStyle: FontStyle.italic,
    fontWeight: FontWeight.w500,
    height: 1.25,
  );
}
