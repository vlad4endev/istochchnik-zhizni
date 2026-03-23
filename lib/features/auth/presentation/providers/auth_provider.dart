import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_token_store.dart';
import '../../../../core/config/app_config.dart';

class AuthSession {
  const AuthSession({
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

const _guestSession = AuthSession(
  token: '',
  firstName: 'Гость',
  lastName: '',
  role: 'member',
);

enum SignUpOutcomeType { approved, pending, failed }

class SignUpOutcome {
  const SignUpOutcome({required this.type, this.message});

  final SignUpOutcomeType type;
  final String? message;
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

class SignInResult {
  const SignInResult.success() : ok = true, message = null;
  const SignInResult.failure(this.message) : ok = false;
  final bool ok;
  final String? message;
}

class AuthController extends AsyncNotifier<AuthSession?> {
  static final String _baseUrl = AppConfig.authApiBaseUrl;
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 25),
      receiveTimeout: const Duration(seconds: 25),
      sendTimeout: const Duration(seconds: 25),
      headers: const {'Accept': 'application/json'},
    ),
  );

  static String? _serverErrorMessage(dynamic data) {
    if (data is Map<String, dynamic>) {
      final err = data['error'];
      if (err is String && err.trim().isNotEmpty) {
        return err.trim();
      }
    }
    return null;
  }

  static String _humanizeServerError(String raw) {
    if (raw == 'Database error') {
      return 'Ошибка базы данных на сервере. Проверьте DATABASE_URL на хосте API '
          '(пароль, порт, SSL) и что миграции применены к этой базе.';
    }
    return raw;
  }

  static String _mapDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Нет связи с сервером. Частая причина: в сборке Flutter не задан '
            'API_BASE_URL на ваш публичный API (не localhost). На Vercel: '
            'Environment Variables → API_BASE_URL → Redeploy. Страница HTTPS '
            'не может вызывать HTTP-API (нужен HTTPS).';
      case DioExceptionType.badCertificate:
        return 'Ошибка проверки SSL-сертификата сервера.';
      case DioExceptionType.badResponse:
        final server = _serverErrorMessage(e.response?.data);
        if (server != null) {
          return _humanizeServerError(server);
        }
        break;
      default:
        break;
    }
    final code = e.response?.statusCode;
    if (code == 401 || code == 403) {
      return 'Неверный телефон или пароль.';
    }
    final server = _serverErrorMessage(e.response?.data);
    if (server != null) {
      return _humanizeServerError(server);
    }
    final msg = e.message;
    if (msg != null && msg.isNotEmpty) {
      return msg;
    }
    return 'Ошибка сети.';
  }

  @override
  Future<AuthSession?> build() async {
    if (AppConfig.authDisabled) {
      return _guestSession;
    }

    await AuthTokenStore.load();
    final cachedSession = AuthTokenStore.cachedSession;
    if (cachedSession == null) {
      return null;
    }

    try {
      final me = await _fetchMe(cachedSession.token);
      if (me == null) {
        await AuthTokenStore.clear();
        return null;
      }

      await AuthTokenStore.saveSession(
        token: me.token,
        firstName: me.firstName,
        lastName: me.lastName,
        role: me.role,
      );
      return me;
    } on DioException {
      // Keep local session on temporary network errors.
      return AuthSession(
        token: cachedSession.token,
        firstName: cachedSession.firstName,
        lastName: cachedSession.lastName,
        role: cachedSession.role,
      );
    } catch (_) {
      await AuthTokenStore.clear();
      return null;
    }
  }

  Future<AuthSession?> _fetchMe(String token) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/me',
      options: Options(
        validateStatus: (status) => status != null && status < 500,
        headers: {'Authorization': 'Bearer $token'},
      ),
    );

    if (response.statusCode != 200 || response.data == null) {
      return null;
    }

    final data = response.data!;
    final firstName = (data['first_name'] as String?)?.trim() ?? '';
    final lastName = (data['last_name'] as String?)?.trim() ?? '';
    final role = (data['app_role'] as String?)?.trim() ?? 'member';

    return AuthSession(
      token: token,
      firstName: firstName,
      lastName: lastName,
      role: role,
    );
  }

  Future<SignInResult> signIn({
    required String phoneNumber,
    required String password,
  }) async {
    if (AppConfig.authDisabled) {
      return const SignInResult.failure('Вход временно отключён.');
    }
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_baseUrl/login',
        data: {'phone_number': phoneNumber.trim(), 'password': password},
        options: Options(
          validateStatus: (status) => status != null && status < 600,
        ),
      );

      if (response.statusCode != 200 || response.data == null) {
        if (response.statusCode == 401 || response.statusCode == 400) {
          return const SignInResult.failure('Неверный телефон или пароль.');
        }
        if (response.statusCode == 500) {
          final raw = _serverErrorMessage(response.data);
          return SignInResult.failure(
            raw != null
                ? _humanizeServerError(raw)
                : 'Сервер вернул ошибку. Попробуйте позже.',
          );
        }
        return const SignInResult.failure('Не удалось войти. Попробуйте позже.');
      }

      final data = response.data!;
      final token = data['token'] as String?;
      final user = data['user'] as Map<String, dynamic>?;
      if (token == null || user == null || token.isEmpty) {
        return const SignInResult.failure('Неверный телефон или пароль.');
      }

      final session = AuthSession(
        token: token,
        firstName: (user['first_name'] as String?)?.trim() ?? '',
        lastName: (user['last_name'] as String?)?.trim() ?? '',
        role: (user['app_role'] as String?)?.trim() ?? 'member',
      );

      await AuthTokenStore.saveSession(
        token: token,
        firstName: session.firstName,
        lastName: session.lastName,
        role: session.role,
      );
      state = AsyncData(session);
      return const SignInResult.success();
    } on DioException catch (e) {
      return SignInResult.failure(_mapDioError(e));
    } catch (_) {
      return const SignInResult.failure(
        'Не удалось войти. Проверьте соединение и настройку API_BASE_URL.',
      );
    }
  }

  Future<SignUpOutcome> signUp({
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String password,
  }) async {
    if (AppConfig.authDisabled) {
      return const SignUpOutcome(
        type: SignUpOutcomeType.failed,
        message: 'Регистрация временно отключена.',
      );
    }
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_baseUrl/register',
        data: {
          'first_name': firstName.trim(),
          'last_name': lastName.trim(),
          'phone_number': phoneNumber.trim(),
          'password': password,
        },
        options: Options(
          validateStatus: (status) => status != null && status < 600,
        ),
      );

      final data = response.data ?? const <String, dynamic>{};

      if (response.statusCode == 500) {
        final raw = _serverErrorMessage(data);
        return SignUpOutcome(
          type: SignUpOutcomeType.failed,
          message: raw != null
              ? _humanizeServerError(raw)
              : 'Сервер вернул ошибку. Попробуйте позже.',
        );
      }

      if (response.statusCode == 201 && data['status'] == 'approved') {
        final token = data['token'] as String?;
        final user = data['user'] as Map<String, dynamic>?;
        if (token == null || user == null || token.isEmpty) {
          return const SignUpOutcome(
            type: SignUpOutcomeType.failed,
            message: 'Ошибка получения сессии после регистрации.',
          );
        }

        final session = AuthSession(
          token: token,
          firstName: (user['first_name'] as String?)?.trim() ?? '',
          lastName: (user['last_name'] as String?)?.trim() ?? '',
          role: (user['app_role'] as String?)?.trim() ?? 'member',
        );

        await AuthTokenStore.saveSession(
          token: token,
          firstName: session.firstName,
          lastName: session.lastName,
          role: session.role,
        );
        state = AsyncData(session);
        return const SignUpOutcome(type: SignUpOutcomeType.approved);
      }

      if (response.statusCode == 202 && data['status'] == 'pending') {
        return SignUpOutcome(
          type: SignUpOutcomeType.pending,
          message: (data['message'] as String?)?.trim(),
        );
      }

      return SignUpOutcome(
        type: SignUpOutcomeType.failed,
        message:
            (data['error'] as String?)?.trim() ?? 'Регистрация не удалась.',
      );
    } on DioException catch (e) {
      return SignUpOutcome(
        type: SignUpOutcomeType.failed,
        message: _mapDioError(e),
      );
    } catch (_) {
      return const SignUpOutcome(
        type: SignUpOutcomeType.failed,
        message:
            'Не удалось обработать ответ сервера. Проверьте соединение и API_BASE_URL.',
      );
    }
  }

  Future<void> signOut() async {
    if (AppConfig.authDisabled) {
      return;
    }
    final current = state.valueOrNull;
    try {
      if (current != null && current.token.isNotEmpty) {
        await _dio.post<void>(
          '$_baseUrl/logout',
          options: Options(
            validateStatus: (status) => status != null && status < 500,
            headers: {'Authorization': 'Bearer ${current.token}'},
          ),
        );
      }
    } catch (_) {
      // ignore network error on logout and clear local session anyway
    } finally {
      await AuthTokenStore.clear();
      state = const AsyncData(null);
    }
  }
}
