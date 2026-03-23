import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

class AppConfig {
  const AppConfig._();

  /// Пока `true` — экраны входа и регистрации скрыты, используется гостевой режим.
  /// Верните `false` или задайте `--dart-define=AUTH_DISABLED=false` при сборке.
  static const bool authDisabled = bool.fromEnvironment(
    'AUTH_DISABLED',
    defaultValue: true,
  );

  static const String _rawApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:40978',
  );

  /// На Vercel `scripts/vercel-build.sh` кладёт `build/web/api-config.json` с URL бэкенда.
  /// Подхватывается при старте веб-приложения (см. [initializeForWeb]).
  static String? _webRuntimeApiBase;

  /// Вызывать из `main()` до [runApp] на web — подставляет URL API из `/api-config.json`.
  static Future<void> initializeForWeb() async {
    if (!kIsWeb) {
      return;
    }
    try {
      final uri = Uri.parse('${Uri.base.origin}/api-config.json');
      final response = await http
          .get(uri)
          .timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) {
        return;
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return;
      }
      final raw = decoded['apiBaseUrl'];
      if (raw is! String) {
        return;
      }
      final trimmed = raw.trim();
      // Пустая строка: запросы к /api/* на том же origin (nginx + Docker).
      _webRuntimeApiBase = trimmed;
    } catch (_) {
      // Оставляем значение из --dart-define=API_BASE_URL
    }
  }

  static String get apiBaseUrl =>
      (_webRuntimeApiBase ?? _rawApiBaseUrl).replaceFirst(RegExp(r'/$'), '');

  /// Для подсказок в UI: при пустом [apiBaseUrl] API на том же хосте, что и веб.
  static String get apiBaseUrlForDisplay =>
      apiBaseUrl.isEmpty ? 'тот же хост (прокси)' : apiBaseUrl;

  /// База для Dio в web при пустом [apiBaseUrl], чтобы пути `/api/...` резолвились в браузере.
  static String get dioBaseUrl {
    if (kIsWeb && apiBaseUrl.isEmpty) {
      return Uri.base.origin;
    }
    return '';
  }

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
      if (u.isEmpty) {
        return false;
      }
      if (u.contains('localhost') || u.contains('127.0.0.1')) {
        return true;
      }
    } catch (_) {}
    return false;
  }
}
