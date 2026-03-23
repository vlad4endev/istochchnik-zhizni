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
}
