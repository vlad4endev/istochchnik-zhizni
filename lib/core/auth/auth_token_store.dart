import 'package:shared_preferences/shared_preferences.dart';

class CachedAuthSessionData {
  const CachedAuthSessionData({
    required this.token,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  final String token;
  final String firstName;
  final String lastName;
  final String role;
}

class AuthTokenStore {
  AuthTokenStore._();

  static const _tokenKey = 'auth_access_token';
  static const _firstNameKey = 'auth_first_name';
  static const _lastNameKey = 'auth_last_name';
  static const _roleKey = 'auth_role';
  static String? _token;
  static String _firstName = '';
  static String _lastName = '';
  static String _role = 'member';

  static String? get token => _token;
  static String get firstName => _firstName;
  static String get lastName => _lastName;
  static String get role => _role;
  static CachedAuthSessionData? get cachedSession {
    final token = _token;
    if (token == null || token.isEmpty) {
      return null;
    }
    return CachedAuthSessionData(
      token: token,
      firstName: _firstName,
      lastName: _lastName,
      role: _role,
    );
  }

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    _firstName = prefs.getString(_firstNameKey) ?? '';
    _lastName = prefs.getString(_lastNameKey) ?? '';
    _role = (prefs.getString(_roleKey) ?? 'member').trim().isEmpty
        ? 'member'
        : (prefs.getString(_roleKey) ?? 'member').trim();
  }

  static Future<void> saveSession({
    required String token,
    required String firstName,
    required String lastName,
    required String role,
  }) async {
    _token = token;
    _firstName = firstName.trim();
    _lastName = lastName.trim();
    _role = role.trim().isEmpty ? 'member' : role.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_firstNameKey, _firstName);
    await prefs.setString(_lastNameKey, _lastName);
    await prefs.setString(_roleKey, _role);
  }

  static Future<void> clear() async {
    _token = null;
    _firstName = '';
    _lastName = '';
    _role = 'member';
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_firstNameKey);
    await prefs.remove(_lastNameKey);
    await prefs.remove(_roleKey);
  }
}
