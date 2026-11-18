import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/token_uploader.dart';

void main() {
  test('успешная отправка отмечает токен доставленным и не повторяется', () async {
    var calls = 0;
    final uploader = TokenUploader(send: (_) async => calls++);
    expect(await uploader.submit('t1'), isTrue);
    expect(uploader.registered, isTrue);
    expect(await uploader.submit('t1'), isTrue);
    expect(calls, 1);
  });

  test('сбой сети: токен не доставлен, повтор сам по расписанию', () {
    fakeAsync((async) {
      var fail = true;
      var calls = 0;
      final uploader = TokenUploader(
        send: (_) async {
          calls++;
          if (fail) throw Exception('нет сети');
        },
      );
      uploader.submit('t1');
      async.flushMicrotasks();
      expect(uploader.registered, isFalse);
      expect(calls, 1);

      fail = false;
      async.elapse(const Duration(seconds: 16));
      expect(calls, 2);
      expect(uploader.registered, isTrue);
    });
  });

  test('после исчерпания повторов возврат в приложение пробует снова', () {
    fakeAsync((async) {
      var fail = true;
      var calls = 0;
      final uploader = TokenUploader(
        delays: const [Duration(seconds: 1)],
        send: (_) async {
          calls++;
          if (fail) throw Exception('5xx');
        },
      );
      uploader.submit('t1');
      async.elapse(const Duration(seconds: 30));
      expect(calls, 2, reason: 'первая попытка и один повтор, дальше тишина');
      expect(uploader.registered, isFalse);

      fail = false;
      uploader.retryNow();
      async.flushMicrotasks();
      expect(uploader.registered, isTrue);
    });
  });

  test('новый токен после обновления Firebase отправляется заново', () async {
    final sent = <String>[];
    final uploader = TokenUploader(send: (t) async => sent.add(t));
    await uploader.submit('a');
    await uploader.submit('b');
    expect(sent, ['a', 'b']);
  });

  test('выход из аккаунта сбрасывает токен и останавливает повторы', () {
    fakeAsync((async) {
      var calls = 0;
      final uploader = TokenUploader(send: (_) async {
        calls++;
        throw Exception('нет сети');
      });
      uploader.submit('t1');
      async.flushMicrotasks();
      uploader.reset();
      async.elapse(const Duration(minutes: 10));
      expect(calls, 1);
      expect(uploader.hasToken, isFalse);
      bool? retried;
      uploader.retryNow().then((v) => retried = v);
      async.flushMicrotasks();
      expect(retried, isFalse);
    });
  });
}
