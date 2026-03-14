import 'package:flutter/material.dart';

/// Брейкпоинты для адаптивного дизайна
class Breakpoints {
  static const double phone = 600;
  static const double tablet = 900;
}

/// Утилиты для адаптивного дизайна (телефоны Android/iOS, планшеты)
class Responsive {
  static bool isPhone(BuildContext context) =>
      MediaQuery.sizeOf(context).width < Breakpoints.phone;

  static bool isTablet(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return w >= Breakpoints.phone && w < Breakpoints.tablet;
  }

  static bool isDesktop(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= Breakpoints.tablet;

  /// Адаптивный отступ: меньше на телефоне
  static double horizontalPadding(BuildContext context) =>
      isPhone(context) ? 16 : 24;

  /// Адаптивный отступ для карточек
  static double cardPadding(BuildContext context) =>
      isPhone(context) ? 16 : 20;

  /// Адаптивный размер иконки в карточке
  static double cardIconSize(BuildContext context) =>
      isPhone(context) ? 36 : 40;

  /// Адаптивный размер шрифта заголовка AppBar
  static double appBarTitleSize(BuildContext context) =>
      isPhone(context) ? 15 : 17;

  /// Минимальная область касания (44pt для iOS)
  static const double minTouchTarget = 44;
}
