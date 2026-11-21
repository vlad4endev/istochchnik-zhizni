import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'json.dart';
import 'realtime.dart';

const defaultApiOrigin = 'https://app.church-tambov.ru';

class AppUser {
  AppUser({
    required this.id,
    required this.name,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.roles,
    required this.registrationStatus,
    this.phone,
    this.username,
    this.avatarUrl,
    this.prayerRequest = '',
    this.ministryRole = '',
    this.ministryDirection = '',
    this.isCollectionCoordinator = false,
  });

  final int id;
  final String name;
  final String firstName;
  final String lastName;
  final String role;
  final List<String> roles;
  final String registrationStatus;
  final String? phone;
  final String? username;
  final String? avatarUrl;
  final String prayerRequest;
  final String ministryRole;

  /// Ответственный за сбор молитвенных нужд (флаг от администратора).
  final bool isCollectionCoordinator;

  /// Направления служения через запятую или «;» — по ним открывается расписание команды.
  final String ministryDirection;

  bool get isPreacher =>
      isAdmin ||
      role == 'pastor' ||
      roles.contains('pastor') ||
      ministryRole.toLowerCase().contains('проповед');

  bool get isActive => registrationStatus == 'active';
  bool get isPending => registrationStatus == 'pending_review';
  bool get isAdmin => role == 'admin' || roles.contains('admin');
  bool get isPastor => role == 'pastor' || roles.contains('pastor');

  String get displayName {
    final full = '$firstName $lastName'.trim();
    if (full.isNotEmpty) return full;
    if (name.trim().isNotEmpty) return name.trim();
    return 'Участник';
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final role = str(json['app_role']).trim().toLowerCase();
    final roles = asList(json['app_roles'])
        .map((e) => str(e).trim().toLowerCase())
        .where((e) => e.isNotEmpty)
        .toList();
    return AppUser(
      id: asInt(json['id']),
      name: str(json['name']),
      firstName: str(json['first_name']),
      lastName: str(json['last_name']),
      role: role.isEmpty ? 'member' : role,
      roles: roles.isEmpty ? [role.isEmpty ? 'member' : role] : roles,
      registrationStatus: str(json['registration_status']).isEmpty
          ? 'active'
          : str(json['registration_status']),
      phone: str(json['phone_number']).isEmpty ? null : str(json['phone_number']),
      username: str(json['username']).isEmpty ? null : str(json['username']),
      avatarUrl: str(json['avatar_url']).isEmpty ? null : str(json['avatar_url']),
      prayerRequest: str(json['prayer_request']),
      ministryRole: str(json['ministry_role']),
      ministryDirection: str(json['ministry_direction']),
      isCollectionCoordinator: asBool(json['is_collection_coordinator']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'first_name': firstName,
        'last_name': lastName,
        'app_role': role,
        'app_roles': roles,
        'registration_status': registrationStatus,
        'phone_number': phone,
        'username': username,
        'avatar_url': avatarUrl,
        'prayer_request': prayerRequest,
        'ministry_role': ministryRole,
        'ministry_direction': ministryDirection,
        'is_collection_coordinator': isCollectionCoordinator,
      };
}

class SectionRule {
  const SectionRule({required this.enabled, required this.roles});
  final bool enabled;
  final List<String> roles;
}

class SessionController extends ChangeNotifier {
  SessionController({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage() {
    dio = Dio(
      BaseOptions(
        baseUrl: defaultApiOrigin,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 25),
        headers: {'Accept': 'application/json'},
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _token;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final path = error.requestOptions.path;
          final status = error.response?.statusCode;
          final isAuthCall = path.contains('/api/auth/login') || path.contains('/api/auth/register');
          if (status == 401 && !isAuthCall) {
            unawaitedLogout();
          }
          handler.next(error);
        },
      ),
    );
  }

  final FlutterSecureStorage _storage;
  late final Dio dio;
  late final ChurchRealtime realtime = ChurchRealtime(this);

  bool ready = false;
  String apiOrigin = defaultApiOrigin;
  ThemeMode themeMode = ThemeMode.system;
  AppUser? user;
  Map<String, SectionRule> sections = {};
  String? _token;

  /// Вызывается после успешного входа или регистрации (например, регистрация пушей).
  final List<Future<void> Function()> afterLogin = [];

  /// Вызывается перед выходом, пока токен ещё действует (отвязка устройства от пушей).
  final List<Future<void> Function()> beforeLogout = [];

  String? get token => _token;

  bool canOpen(String sectionId) {
    final rule = sections[sectionId];
    if (rule == null) return true;
    if (!rule.enabled) return false;
    final mine = user?.roles ?? const <String>[];
    return mine.any(rule.roles.contains);
  }

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    apiOrigin = (prefs.getString('api_origin') ?? defaultApiOrigin).trim();
    if (apiOrigin.isEmpty) apiOrigin = defaultApiOrigin;
    dio.options.baseUrl = apiOrigin;
    final mode = prefs.getString('theme_mode');
    themeMode = switch (mode) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    _token = await _readSecure('auth_token');
    final rawUser = await _readSecure('auth_user');
    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        user = AppUser.fromJson(asMap(jsonDecode(rawUser)));
      } catch (_) {
        user = null;
      }
    }
    ready = true;
    notifyListeners();
    if (_token != null && user != null) {
      realtime.start();
      await refreshProfile();
      await loadSections();
    }
  }

  /// Адрес сервера, который получится после [setApiOrigin] с этим значением.
  static String normalizeOrigin(String value) {
    final next = value.trim().replaceAll(RegExp(r'/+$'), '');
    return next.isEmpty ? defaultApiOrigin : next;
  }

  /// Смена сервера завершает сессию: токен выдан одним сервером и не должен
  /// уходить на другой адрес. Выход отправляется ещё на прежний сервер.
  Future<void> setApiOrigin(String value) async {
    final next = normalizeOrigin(value);
    if (next != apiOrigin && _token != null) {
      await logout();
    }
    apiOrigin = next;
    dio.options.baseUrl = apiOrigin;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_origin', apiOrigin);
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme_mode', switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    });
    notifyListeners();
  }

  Future<String?> login(String phone, String password) async {
    try {
      final response = await dio.post<Object?>(
        '/api/auth/login',
        data: {'phone_number': phone, 'password': password, 'remember_me': true},
      );
      final body = asMap(response.data);
      if (body['code'] == 'password_reset_required') {
        return 'Нужно задать новый пароль. Сделайте это на сайте церкви, затем войдите здесь.';
      }
      return await _acceptSession(body);
    } on DioException catch (error) {
      return readApiError(error);
    }
  }

  Future<String?> register({
    required String firstName,
    required String lastName,
    required String phone,
    required String password,
    required String birthDate,
  }) async {
    try {
      final response = await dio.post<Object?>(
        '/api/auth/register',
        data: {
          'first_name': firstName,
          'last_name': lastName,
          'phone_number': phone,
          'password': password,
          'birth_date': birthDate,
        },
      );
      return await _acceptSession(asMap(response.data));
    } on DioException catch (error) {
      return readApiError(error);
    }
  }

  Future<String?> _acceptSession(Map<String, dynamic> body) async {
    final token = str(body['token']);
    final userJson = asMap(body['user']);
    if (token.isEmpty || userJson.isEmpty) {
      final message = str(body['message']);
      return message.isEmpty ? 'Сервер не вернул сессию' : message;
    }
    _token = token;
    user = AppUser.fromJson(userJson);
    await _writeSecure('auth_token', token);
    await _writeSecure('auth_user', jsonEncode(user!.toJson()));
    notifyListeners();
    realtime.start();
    await loadSections();
    for (final hook in afterLogin) {
      unawaited(hook());
    }
    return null;
  }

  Future<void> replaceUser(AppUser next) async {
    user = next;
    await _writeSecure('auth_user', jsonEncode(next.toJson()));
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    if (_token == null) return;
    try {
      final response = await dio.get<Object?>('/api/auth/me');
      user = AppUser.fromJson(asMap(response.data));
      await _writeSecure('auth_user', jsonEncode(user!.toJson()));
      notifyListeners();
    } on DioException {
      /* сессия обновится при следующем успешном запросе */
    }
  }

  Future<void> loadSections() async {
    try {
      final response = await dio.get<Object?>('/api/settings/sections');
      final raw = asMap(asMap(response.data)['sections']);
      final next = <String, SectionRule>{};
      for (final entry in raw.entries) {
        final rule = asMap(entry.value);
        next[entry.key] = SectionRule(
          enabled: asBool(rule['enabled']),
          roles: asList(rule['roles']).map((e) => str(e).toLowerCase()).toList(),
        );
      }
      sections = next;
      notifyListeners();
    } on DioException {
      sections = {};
    }
  }

  Future<void> logout() async {
    if (_token != null) {
      for (final hook in beforeLogout) {
        try {
          await hook().timeout(const Duration(seconds: 5));
        } catch (_) {}
      }
    }
    realtime.stop();
    try {
      if (_token != null) {
        await dio.post<Object?>('/api/auth/logout');
      }
    } catch (_) {
      /* локальный выход всё равно завершаем */
    }
    _token = null;
    user = null;
    sections = {};
    await _deleteSecure('auth_token');
    await _deleteSecure('auth_user');
    notifyListeners();
  }

  Future<String?> _readSecure(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeSecure(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } catch (_) {}
  }

  Future<void> _deleteSecure(String key) async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }

  void unawaitedLogout() {
    logout();
  }
}

String readApiError(DioException error) {
  final data = error.response?.data;
  if (data is Map && data['error'] is String && str(data['error']).isNotEmpty) {
    return str(data['error']);
  }
  if (data is String && data.trim().isNotEmpty) return data.trim();
  final code = error.response?.statusCode;
  if (code != null) return 'Ошибка $code';
  return 'Нет соединения с сервером';
}
