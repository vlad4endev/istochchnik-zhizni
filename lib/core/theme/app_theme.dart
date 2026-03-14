import 'package:flutter/material.dart';

/// Современная минималистичная палитра
class AppColors {
  AppColors._();

  // Primary — бордовый, обновлённый
  static const primary = Color(0xFF7D3640);
  static const primaryDark = Color(0xFF5C2830);
  static const primaryLight = Color(0xFF9E4A55);
  static const accent = Color(0xFFDC2626);

  // Neutrals — чистые, контрастные
  static const surface = Color(0xFFF7F5F3);
  static const surfaceElevated = Color(0xFFFFFFFF);
  static const cardBg = Color(0xFFFFFFFF);

  // Text — чёткая иерархия
  static const textPrimary = Color(0xFF1C1917);
  static const textSecondary = Color(0xFF57534E);
  static const textTertiary = Color(0xFFA8A29E);
  static const textMuted = textTertiary;
  static const textOnPrimary = Color(0xFFFFFFFF);

  // Accents для карточек
  static const accentMember = Color(0xFF6366F1);
  static const accentTheme = Color(0xFF0D9488);
  static const accentMinistry = Color(0xFFEA580C);
  static const accentBackslider = Color(0xFFBE185D);

  // Aliases
  static const burgundy = primary;
  static const lightBrown = textOnPrimary;
  static const textOnDark = textOnPrimary;
  static const red = accent;
  static const memberAccent = accentMember;
  static const themeAccent = accentTheme;
  static const ministryAccent = accentMinistry;
  static const backsliderAccent = accentBackslider;
  static const surfaceSoft = Color(0xFFE8DCD4);
  static const dividerLight = Color(0xFFF5F3F0);
}

/// Радиусы — крупные, современные
class AppRadius {
  AppRadius._();

  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 28;
  static const double xxl = 32;
  static const double full = 999;
}

/// Тени — мягкие, многослойные
class AppShadows {
  AppShadows._();

  static List<BoxShadow> card = [
    BoxShadow(
      color: const Color(0xFF1C1917).withOpacity(0.04),
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: const Color(0xFF1C1917).withOpacity(0.02),
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> cardSubtle = [
    BoxShadow(
      color: const Color(0xFF1C1917).withOpacity(0.03),
      blurRadius: 16,
      offset: const Offset(0, 4),
    ),
  ];

  static List<BoxShadow> floating = [
    BoxShadow(
      color: const Color(0xFF1C1917).withOpacity(0.08),
      blurRadius: 32,
      offset: const Offset(0, 12),
    ),
    BoxShadow(
      color: const Color(0xFF1C1917).withOpacity(0.04),
      blurRadius: 8,
      offset: const Offset(0, 4),
    ),
  ];
}

/// Типографика в стиле 2024–2025
class AppTypography {
  AppTypography._();

  static const displayLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.8,
    height: 1.2,
  );

  static const displayMedium = TextStyle(
    fontSize: 26,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.25,
  );

  static const headlineLarge = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    height: 1.3,
  );

  static const headlineMedium = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.3,
    height: 1.35,
  );

  static const titleLarge = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    height: 1.4,
  );

  static const titleMedium = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    letterSpacing: 0,
    height: 1.4,
  );

  static const bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
    height: 1.5,
  );

  static const bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.15,
    height: 1.55,
  );

  static const labelLarge = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
    height: 1.4,
  );

  static const labelSmall = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.8,
    height: 1.3,
  );
}
