import 'package:material_ui/material_ui.dart';

const churchBurgundy = Color(0xFF7D3640);
const churchPaper = Color(0xFFF4F1ED);

ThemeData churchTheme({required Brightness brightness}) {
  final scheme = ColorScheme.fromSeed(
    seedColor: churchBurgundy,
    brightness: brightness,
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: brightness == Brightness.light ? churchPaper : scheme.surface,
    useMaterial3: true,
    appBarTheme: AppBarTheme(
      centerTitle: false,
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surfaceContainerLowest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
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
