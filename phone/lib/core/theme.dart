import 'package:material_ui/material_ui.dart';

import '../ui/kit/tokens.dart';

const churchBurgundy = ChurchColors.wine;
const churchPaper = ChurchColors.cream;

ThemeData churchTheme({required Brightness brightness}) {
  final dark = brightness == Brightness.dark;
  final palette = dark ? ChurchPalette.dark : ChurchPalette.light;
  final scheme = ColorScheme.fromSeed(seedColor: ChurchColors.wine, brightness: brightness).copyWith(
    primary: dark ? ChurchColors.amber : ChurchColors.wine,
    onPrimary: dark ? ChurchColors.amberInk : Colors.white,
    secondary: ChurchColors.amber,
    onSecondary: ChurchColors.amberInk,
    error: ChurchColors.danger,
    surface: palette.sheet,
    onSurface: palette.ink,
    onSurfaceVariant: palette.inkMuted,
    outline: palette.outline,
    outlineVariant: palette.hairline,
    surfaceContainerLowest: palette.card,
    surfaceContainerLow: palette.card,
    surfaceContainer: palette.card,
    surfaceContainerHigh: palette.field,
    surfaceContainerHighest: palette.accentSoft,
  );

  final fieldBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(Radii.lg),
    borderSide: BorderSide(color: palette.outline),
  );

  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: ChurchType.family,
    scaffoldBackgroundColor: palette.sheet,
    extensions: [palette],
  );

  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: palette.ink, displayColor: palette.ink),
    appBarTheme: AppBarTheme(
      centerTitle: false,
      backgroundColor: ChurchColors.night,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: palette.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card)),
    ),
    dividerTheme: DividerThemeData(color: palette.hairline, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      hintStyle: TextStyle(color: palette.inkFaint, fontSize: 15.5),
      labelStyle: TextStyle(color: palette.inkMuted),
      border: fieldBorder,
      enabledBorder: fieldBorder,
      focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: palette.accent, width: 1.6)),
      errorBorder: fieldBorder.copyWith(borderSide: const BorderSide(color: ChurchColors.danger)),
      focusedErrorBorder: fieldBorder.copyWith(borderSide: const BorderSide(color: ChurchColors.danger, width: 1.6)),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: palette.accent,
      selectionColor: palette.accent.withValues(alpha: 0.25),
      selectionHandleColor: palette.accent,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: palette.accent),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? const Color(0xFF3A1C24) : const Color(0xFF3A1018),
      contentTextStyle: const TextStyle(fontFamily: ChurchType.family, color: Colors.white, fontSize: 14.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.sheet,
      surfaceTintColor: Colors.transparent,
      dragHandleColor: palette.chevron,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.sheet,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: TextStyle(
        fontFamily: ChurchType.family,
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: palette.ink,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.accent,
        textStyle: const TextStyle(fontFamily: ChurchType.family, fontWeight: FontWeight.w700, fontSize: 14.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: ChurchColors.wine,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
        textStyle: const TextStyle(fontFamily: ChurchType.family, fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: ChurchColors.amber,
      thumbColor: ChurchColors.amber,
      inactiveTrackColor: Colors.white.withValues(alpha: 0.18),
      overlayColor: ChurchColors.amber.withValues(alpha: 0.18),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? ChurchColors.successBright : palette.outline,
      ),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: palette.sheet,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: ChurchColors.night,
      headerForegroundColor: Colors.white,
    ),
  );
}

String roleLabel(String role) {
  switch (role) {
    case 'admin':
      return 'Администратор';
    case 'pastor':
      return 'Пастор';
    case 'minister':
      return 'Служитель';
    case 'musician':
      return 'Музыкант';
    case 'editor':
      return 'Редактор';
    case 'parishioner':
      return 'Прихожанин';
    default:
      return 'Участник';
  }
}
