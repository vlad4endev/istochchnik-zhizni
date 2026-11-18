import 'dart:async';

/// Отправка токена устройства на сервер с повторами: сеть могла пропасть именно в момент входа.
/// Токен считается доставленным, только когда сервер ответил успехом.
class TokenUploader {
  TokenUploader({
    required this.send,
    this.delays = const [Duration(seconds: 15), Duration(minutes: 1), Duration(minutes: 5)],
    this.onChange,
  });

  /// Должна бросать исключение, если сервер токен не принял.
  final Future<void> Function(String token) send;

  /// Паузы между автоматическими повторами. Когда они кончились, ждём [retryNow] (возврат в приложение).
  final List<Duration> delays;
  final void Function()? onChange;

  String? _wanted;
  String? _sent;
  Timer? _timer;
  int _attempt = 0;
  bool _busy = false;

  bool get registered => _wanted != null && _wanted == _sent;
  bool get hasToken => _wanted != null;

  Future<bool> submit(String token) {
    if (_wanted != token) _attempt = 0;
    _wanted = token;
    return _flush();
  }

  /// Вернулись в приложение или появилась сеть: пробуем снова, если токен ещё не доставлен.
  Future<bool> retryNow() {
    if (_wanted == null) return Future.value(false);
    _attempt = 0;
    return _flush();
  }

  Future<bool> _flush() async {
    final token = _wanted;
    if (token == null) return false;
    if (token == _sent) return true;
    if (_busy) return false;
    _busy = true;
    _timer?.cancel();
    try {
      await send(token);
      _sent = token;
      _attempt = 0;
      return true;
    } catch (_) {
      _scheduleRetry();
      return false;
    } finally {
      _busy = false;
      onChange?.call();
    }
  }

  void _scheduleRetry() {
    if (_attempt >= delays.length) return;
    final delay = delays[_attempt++];
    _timer = Timer(delay, () => unawaited(_flush()));
  }

  /// Выход из аккаунта: токен больше не наш.
  void reset() {
    _timer?.cancel();
    _wanted = null;
    _sent = null;
    _attempt = 0;
    onChange?.call();
  }

  void dispose() => _timer?.cancel();
}
