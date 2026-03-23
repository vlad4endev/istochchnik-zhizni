import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  const AppConfig._();

  static const String _rawApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:40978',
  );

  static String get apiBaseUrl => _rawApiBaseUrl.replaceFirst(RegExp(r'/$'), '');
  static String get authApiBaseUrl => '$apiBaseUrl/api/auth';
  static String get usersApiBaseUrl => '$apiBaseUrl/api/users';
  static String get calendarApiBaseUrl => '$apiBaseUrl/api/calendar';

  /// Web на Vercel с билдом без `--dart-define=API_BASE_URL=...` оставляет localhost —
  /// браузер ходит на localhost пользователя, а не на ваш API.
  static bool get isApiUrlProbablyWrongForWeb {
    if (!kIsWeb) {
      return false;
    }
    try {
      final host = Uri.base.host;
      if (host.isEmpty) {
        return false;
      }
      if (host == 'localhost' || host.startsWith('127.')) {
        return false;
      }
      final u = apiBaseUrl;
      if (u.contains('localhost') || u.contains('127.0.0.1')) {
        return true;
      }
    } catch (_) {}
    return false;
  }
}
