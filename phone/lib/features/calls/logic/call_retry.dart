import 'dart:async';

import 'package:dio/dio.dart';

/// Ошибки, после которых запрос к серверу звонков имеет смысл повторить сразу:
/// сеть моргнула или сервер не успел ответить. Ошибки доступа и валидации (4xx) повторять бессмысленно.
bool isTransientCallError(Object error) {
  if (error is! DioException) return false;
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
      return true;
    case DioExceptionType.badResponse:
      final code = error.response?.statusCode ?? 0;
      return code == 502 || code == 503 || code == 504;
    case DioExceptionType.badCertificate:
    case DioExceptionType.cancel:
    case DioExceptionType.unknown:
    case DioExceptionType.transformTimeout:
      return false;
  }
}

/// Выполняет [action]; при временной ошибке один раз повторяет через [delay], вызвав [onRetry].
/// Человек не должен жать «Повторить» из-за единичного сбоя сети или медленного ответа сервера.
Future<T> retryOnceOnTransient<T>(
  Future<T> Function() action, {
  void Function()? onRetry,
  Duration delay = const Duration(milliseconds: 600),
  bool Function()? isCancelled,
}) async {
  try {
    return await action();
  } catch (e) {
    if (!isTransientCallError(e) || (isCancelled?.call() ?? false)) rethrow;
    onRetry?.call();
    await Future<void>.delayed(delay);
    if (isCancelled?.call() ?? false) rethrow;
    return action();
  }
}
