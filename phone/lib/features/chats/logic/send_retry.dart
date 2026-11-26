import 'dart:math';

import 'package:dio/dio.dart' show DioException, DioExceptionType;

/// Число попыток отправки одного сообщения (с тем же идентификатором — дубля не будет).
const sendAttempts = 3;

/// Пауза перед повтором: 0,8 с, затем 1,6 с.
Duration sendRetryDelay(int attempt) => Duration(milliseconds: 800 * attempt);

/// Идентификатор сообщения от клиента: сервер по нему узнаёт повтор и не создаёт второе сообщение.
String newClientMsgId([Random? random]) {
  final r = random ?? Random.secure();
  final bytes = List.generate(12, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  return 'flutter-${DateTime.now().millisecondsSinceEpoch}-$bytes';
}

/// Сбой, после которого отправку стоит повторить: связь оборвалась, таймаут или сервер временно недоступен.
/// Отказ сервера (нет прав, неверные данные) повторять бессмысленно.
bool isTransientSendError(Object error) {
  if (error is! DioException) return false;
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
    case DioExceptionType.connectionError:
      return true;
    case DioExceptionType.badResponse:
      final code = error.response?.statusCode ?? 0;
      return code == 408 || code == 429 || code >= 500;
    case DioExceptionType.unknown:
      return error.response == null;
    case DioExceptionType.cancel:
    case DioExceptionType.badCertificate:
      return false;
  }
}
