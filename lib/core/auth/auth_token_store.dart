import 'package:shared_preferences/shared_preferences.dart';

class AuthTokenStore {
  AuthTokenStore._();

  static const _tokenKey = 'auth_access_token';
  static String? _token;

  static String? get token => _token;

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
  }

  static Future<void> save(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  static Future<void> clear() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }
}
