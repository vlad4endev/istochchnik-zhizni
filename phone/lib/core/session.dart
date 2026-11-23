import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'drafts.dart';
import 'http_cache.dart';
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
    this.birthDate,
    this.email = '',
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

  /// День рождения `ГГГГ-ММ-ДД` или null.
  final String? birthDate;
  final String email;

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
      birthDate: str(json['birth_date']).length >= 10 ? str(json['birth_date']).substring(0, 10) : null,
      email: str(json['email']).trim(),
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
        'birth_date': birthDate,
        'email': email,
      };
}

class SectionRule {
  const SectionRule({required this.enabled, required this.roles});
  final bool enabled;
  final List<String> roles;
}

/// Итог продления сессии: продлена, отклонена сервером (нужен вход) или не вышло из-за связи.
enum RefreshOutcome { renewed, rejected, unavailable }

class SessionController extends ChangeNotifier {
  SessionController({FlutterSecureStorage? storage, Duration cacheRecheckAfter = const Duration(seconds: 3)})
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
        onRequest: (options, handler) async {
          // Токен вот-вот истечёт — продлеваем заранее, чтобы человека не выкидывало на вход.
          if (!_isAuthPath(options.path) && _refreshToken != null && _tokenExpiresSoon()) {
            await _refreshSession();
          }
          final token = _token;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final path = error.requestOptions.path;
          final status = error.response?.statusCode;
          final isAuthCall = _isAuthPath(path);
          if (status == 401 && !isAuthCall) {
            if (error.requestOptions.extra[_retriedKey] != true) {
              final outcome = await _refreshSession();
              if (outcome == RefreshOutcome.renewed) {
                try {
                  return handler.resolve(await _repeat(error.requestOptions));
                } on DioException catch (again) {
                  return handler.next(again);
                }
              }
              // Нет связи — это не повод выходить: человек остаётся в аккаунте, запрос просто не удался.
              if (outcome == RefreshOutcome.unavailable) return handler.next(error);
            }
            unawaitedLogout();
          }
          handler.next(error);
        },
      ),
    );
    cache = HttpCache(dio: dio, userId: () => user?.id, directory: _supportDirectory, recheckAfter: cacheRecheckAfter);
    dio.interceptors.add(cache);
  }

  static Future<Directory?>? _supportDirectoryFuture;

  /// Папка приложения; ответ запоминаем. Запросы её не ждут: диск нужен только для записи копии и чтения при запуске.
  static Future<Directory?> _supportDirectory() => _supportDirectoryFuture ??= () async {
        try {
          return await getApplicationSupportDirectory();
        } catch (_) {
          return null;
        }
      }();

  final FlutterSecureStorage _storage;
  late final Dio dio;

  /// Копия ответов сервера: разделы открываются мгновенно, свежее подгружается фоном.
  late final HttpCache cache;
  late final ChurchRealtime realtime = ChurchRealtime(this);

  bool ready = false;
  String apiOrigin = defaultApiOrigin;
  ThemeMode themeMode = ThemeMode.system;
  AppUser? user;
  Map<String, SectionRule> sections = {};
  String? _token;

  /// Cookie обновления сессии «имя=значение» (живёт до 90 дней, меняется при каждом продлении).
  String? _refreshToken;
  Future<RefreshOutcome>? _refreshing;

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


  static const _refreshKey = 'auth_refresh';
  static const _retriedKey = 'sessionRetried';

  /// Вход, регистрация, продление и выход сами про сессию не спрашивают: на них 401 означает «неверные данные»
  /// или «уже вышли», и продлевать сессию из-за них нельзя.
  bool _isAuthPath(String path) =>
      path.contains('/api/auth/login') ||
      path.contains('/api/auth/register') ||
      path.contains('/api/auth/refresh') ||
      path.contains('/api/auth/logout');

  /// Достаёт cookie обновления («имя=значение», как отдал сервер) из ответов входа и продления:
  /// приложение cookie само не хранит.
  static String? refreshCookieFrom(Headers headers) {
    for (final line in headers['set-cookie'] ?? const <String>[]) {
      final pair = line.split(';').first;
      final eq = pair.indexOf('=');
      if (eq <= 0) continue;
      final name = pair.substring(0, eq).trim().toLowerCase();
      final value = pair.substring(eq + 1).trim();
      if (name.contains('refresh') && value.isNotEmpty) return pair.trim();
    }
    return null;
  }

  /// Срок действия токена доступа из самого токена (JWT); null, если токен другого вида.
  static DateTime? tokenExpiry(String? token) {
    if (token == null) return null;
    final parts = token.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = asMap(jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))));
      final exp = payload['exp'];
      if (exp is! num) return null;
      return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
    } catch (_) {
      return null;
    }
  }

  bool _tokenExpiresSoon() {
    final expiry = tokenExpiry(_token);
    if (expiry == null) return false;
    return expiry.difference(DateTime.now()) < const Duration(minutes: 2);
  }

  /// Продлевает сессию. Одновременные запросы ждут один и тот же ответ: сервер меняет токен обновления
  /// при каждом продлении, второй параллельный запрос с прежним токеном был бы отклонён.
  Future<RefreshOutcome> _refreshSession() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<RefreshOutcome> _doRefresh() async {
    final refresh = _refreshToken;
    if (refresh == null || refresh.isEmpty || _token == null) return RefreshOutcome.rejected;
    try {
      final response = await dio.post<Object?>(
        '/api/auth/refresh',
        options: Options(headers: {'Cookie': refresh}),
      );
      final body = asMap(response.data);
      final next = str(body['accessToken']).isNotEmpty ? str(body['accessToken']) : str(body['token']);
      if (next.isEmpty) return RefreshOutcome.rejected;
      _token = next;
      await _writeSecure('auth_token', next);
      final rotated = refreshCookieFrom(response.headers);
      if (rotated != null) {
        _refreshToken = rotated;
        await _writeSecure(_refreshKey, rotated);
      }
      // Соединение с сервером в реальном времени узнаёт новый токен при переподключении.
      if (user != null) realtime.start();
      return RefreshOutcome.renewed;
    } on DioException catch (error) {
      final status = error.response?.statusCode ?? 0;
      // Сервер ответил отказом (токен недействителен или отозван) — сессии конец. Нет связи или сбой сервера — нет.
      return status == 401 || status == 403 ? RefreshOutcome.rejected : RefreshOutcome.unavailable;
    } catch (_) {
      return RefreshOutcome.unavailable;
    }
  }

  /// Повторяет запрос, упавший из-за истёкшего токена, уже с новым токеном.
  Future<Response<dynamic>> _repeat(RequestOptions options) {
    final data = options.data;
    final headers = Map<String, dynamic>.of(options.headers)..['Authorization'] = 'Bearer $_token';
    return dio.fetch<dynamic>(options.copyWith(
      headers: headers,
      data: data is FormData ? data.clone() : data,
      extra: {...options.extra, _retriedKey: true},
    ));
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
    _refreshToken = await _readSecure(_refreshKey);
    final rawUser = await _readSecure('auth_user');
    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        user = AppUser.fromJson(asMap(jsonDecode(rawUser)));
      } catch (_) {
        user = null;
      }
    }
    if (_token != null && user != null) {
      // Сохранённое с прошлого раза — в память до первого экрана, чтобы разделы открылись мгновенно.
      await cache.warm().timeout(const Duration(seconds: 1), onTimeout: () {});
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
      return await _acceptSession(body, refresh: refreshCookieFrom(response.headers));
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
      return await _acceptSession(asMap(response.data), refresh: refreshCookieFrom(response.headers));
    } on DioException catch (error) {
      return readApiError(error);
    }
  }

  Future<String?> _acceptSession(Map<String, dynamic> body, {String? refresh}) async {
    final token = str(body['token']);
    final userJson = asMap(body['user']);
    if (token.isEmpty || userJson.isEmpty) {
      final message = str(body['message']);
      return message.isEmpty ? 'Сервер не вернул сессию' : message;
    }
    _token = token;
    _refreshToken = refresh;
    if (refresh != null) {
      await _writeSecure(_refreshKey, refresh);
    } else {
      await _deleteSecure(_refreshKey);
    }
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
        final refresh = _refreshToken;
        await dio.post<Object?>(
          '/api/auth/logout',
          options: refresh == null ? null : Options(headers: {'Cookie': refresh}),
        );
      }
    } catch (_) {
      /* локальный выход всё равно завершаем */
    }
    await cache.clear();
    await _forgetLegacyCache();
    await DraftStore.instance.forget();
    _token = null;
    _refreshToken = null;
    user = null;
    sections = {};
    await _deleteSecure(_refreshKey);
    await _deleteSecure('auth_token');
    await _deleteSecure('auth_user');
    notifyListeners();
  }

  /// Прежние копии ответов (до кеша на диске) тоже личные — стираем при выходе.
  Future<void> _forgetLegacyCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final key in prefs.getKeys().where((k) => k.startsWith('cache:')).toList()) {
        await prefs.remove(key);
      }
    } catch (_) {}
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
