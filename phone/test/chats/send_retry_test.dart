import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/logic/send_retry.dart';

DioException _e(DioExceptionType type, {int? status}) {
  final req = RequestOptions(path: '/x');
  return DioException(
    requestOptions: req,
    type: type,
    response: status == null ? null : Response(requestOptions: req, statusCode: status),
  );
}

void main() {
  test('таймаут, обрыв связи и 5xx — повторяем', () {
    expect(isTransientSendError(_e(DioExceptionType.receiveTimeout)), isTrue);
    expect(isTransientSendError(_e(DioExceptionType.connectionError)), isTrue);
    expect(isTransientSendError(_e(DioExceptionType.badResponse, status: 502)), isTrue);
    expect(isTransientSendError(_e(DioExceptionType.badResponse, status: 429)), isTrue);
  });

  test('отказ сервера и отмена — не повторяем', () {
    expect(isTransientSendError(_e(DioExceptionType.badResponse, status: 403)), isFalse);
    expect(isTransientSendError(_e(DioExceptionType.badResponse, status: 400)), isFalse);
    expect(isTransientSendError(_e(DioExceptionType.cancel)), isFalse);
    expect(isTransientSendError(StateError('нет')), isFalse);
  });

  test('идентификаторы уникальны и укладываются в лимит сервера (160)', () {
    final ids = {for (var i = 0; i < 200; i++) newClientMsgId()};
    expect(ids.length, 200);
    expect(ids.every((id) => id.length <= 128), isTrue);
  });
}
