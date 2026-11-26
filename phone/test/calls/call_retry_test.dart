import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/calls/logic/call_retry.dart';

DioException _err(DioExceptionType type, [int? code]) => DioException(
  requestOptions: RequestOptions(path: '/x'),
  type: type,
  response: code == null
      ? null
      : Response<Object?>(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: code,
        ),
);

void main() {
  test('временные ошибки распознаются, остальные — нет', () {
    expect(isTransientCallError(_err(DioExceptionType.receiveTimeout)), isTrue);
    expect(
      isTransientCallError(_err(DioExceptionType.connectionError)),
      isTrue,
    );
    expect(
      isTransientCallError(_err(DioExceptionType.badResponse, 503)),
      isTrue,
    );
    expect(
      isTransientCallError(_err(DioExceptionType.badResponse, 409)),
      isFalse,
    );
    expect(
      isTransientCallError(_err(DioExceptionType.badResponse, 403)),
      isFalse,
    );
    expect(isTransientCallError(StateError('x')), isFalse);
  });

  test('повторяет один раз и возвращает результат', () async {
    var calls = 0;
    var retried = 0;
    final r = await retryOnceOnTransient<int>(
      () async {
        calls++;
        if (calls == 1) throw _err(DioExceptionType.receiveTimeout);
        return 42;
      },
      onRetry: () => retried++,
      delay: Duration.zero,
    );
    expect(r, 42);
    expect(calls, 2);
    expect(retried, 1);
  });

  test('не повторяет 4xx и не делает больше одного повтора', () async {
    var calls = 0;
    await expectLater(
      retryOnceOnTransient<int>(() async {
        calls++;
        throw _err(DioExceptionType.badResponse, 409);
      }, delay: Duration.zero),
      throwsA(isA<DioException>()),
    );
    expect(calls, 1);

    calls = 0;
    await expectLater(
      retryOnceOnTransient<int>(() async {
        calls++;
        throw _err(DioExceptionType.connectionTimeout);
      }, delay: Duration.zero),
      throwsA(isA<DioException>()),
    );
    expect(calls, 2);
  });

  test('отменённый звонок не повторяется', () async {
    var calls = 0;
    await expectLater(
      retryOnceOnTransient<int>(
        () async {
          calls++;
          throw _err(DioExceptionType.receiveTimeout);
        },
        delay: Duration.zero,
        isCancelled: () => true,
      ),
      throwsA(isA<DioException>()),
    );
    expect(calls, 1);
  });
}
