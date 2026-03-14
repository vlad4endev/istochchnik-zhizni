import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_token_store.dart';

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

enum SignUpOutcomeType { approved, pending, failed }

class SignUpOutcome {
  const SignUpOutcome({required this.type, this.message});

  final SignUpOutcomeType type;
  final String? message;
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

class AuthController extends AsyncNotifier<AuthSession?> {
  static const String _baseUrl = 'http://localhost:3000/api/auth';
  final Dio _dio = Dio();

  @override
  Future<AuthSession?> build() async {
    await AuthTokenStore.load();
    final token = AuthTokenStore.token;
    if (token == null || token.isEmpty) {
      return null;
    }

    final me = await _fetchMe(token);
    if (me == null) {
      await AuthTokenStore.clear();
      return null;
    }

    return me;
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

  Future<bool> signIn({
    required String phoneNumber,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_baseUrl/login',
        data: {'phone_number': phoneNumber.trim(), 'password': password},
        options: Options(
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (response.statusCode != 200 || response.data == null) {
        return false;
      }

      final data = response.data!;
      final token = data['token'] as String?;
      final user = data['user'] as Map<String, dynamic>?;
      if (token == null || user == null || token.isEmpty) {
        return false;
      }

      final session = AuthSession(
        token: token,
        firstName: (user['first_name'] as String?)?.trim() ?? '',
        lastName: (user['last_name'] as String?)?.trim() ?? '',
        role: (user['app_role'] as String?)?.trim() ?? 'member',
      );

      await AuthTokenStore.save(token);
      state = AsyncData(session);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<SignUpOutcome> signUp({
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String password,
  }) async {
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
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      final data = response.data ?? const <String, dynamic>{};

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

        await AuthTokenStore.save(token);
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
    } catch (_) {
      return const SignUpOutcome(
        type: SignUpOutcomeType.failed,
        message: 'Не удалось отправить регистрацию. Проверьте соединение.',
      );
    }
  }

  Future<void> signOut() async {
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
