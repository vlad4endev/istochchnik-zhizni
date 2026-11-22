import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../../core/json.dart';

// ───────────────────────── чистые функции ─────────────────────────

/// Громкость в децибелах (около −45…0) → столбики волны 0…100.
List<int> waveformFromDecibels(List<double> decibels, {int bars = 40}) {
  if (decibels.isEmpty) return List<int>.filled(bars, 8);
  int level(double db) => (((db.isFinite ? db : -45).clamp(-45.0, 0.0) + 45) / 45 * 100).round();
  final out = <int>[];
  for (var i = 0; i < bars; i++) {
    final from = (i * decibels.length / bars).floor();
    final to = math.max(from + 1, ((i + 1) * decibels.length / bars).floor()).clamp(0, decibels.length);
    var peak = 0;
    for (var j = from; j < to; j++) {
      peak = math.max(peak, level(decibels[j]));
    }
    out.add(math.max(peak, 6));
  }
  return out;
}

/// Волна из сообщения; если её нет (запись из веба) — ровная заглушка.
List<int> waveformFromPayload(Object? raw, {int bars = 40}) {
  final list = asList(raw);
  if (list.isEmpty) return List<int>.filled(bars, 22);
  return [for (final v in list) (v is num ? v.toInt() : 0).clamp(4, 100)];
}

/// «0:07», «1:05».
String clockText(Duration d) {
  final total = d.inSeconds < 0 ? 0 : d.inSeconds;
  return '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}

/// Скорость воспроизведения по кругу: 1× → 1,5× → 2× → 1×.
double nextSpeed(double current) => current < 1.25 ? 1.5 : (current < 1.75 ? 2.0 : 1.0);

String speedLabel(double speed) => speed == speed.roundToDouble() ? '${speed.toInt()}×' : '${speed.toString().replaceAll('.', ',')}×';

/// Что сделал палец при отпускании кнопки записи.
enum ReleaseAction { send, cancel, lock }

const _cancelDistance = 90.0;
const _lockDistance = 70.0;

ReleaseAction releaseAction({required double dx, required double dy}) {
  if (dx <= -_cancelDistance) return ReleaseAction.cancel;
  if (dy <= -_lockDistance) return ReleaseAction.lock;
  return ReleaseAction.send;
}

// ───────────────────────── запись ─────────────────────────

/// Готовая запись.
class VoiceClip {
  const VoiceClip({required this.path, required this.duration, required this.waveform});
  final String path;
  final Duration duration;
  final List<int> waveform;
}

/// Микрофон за интерфейсом: в приложении — пакет `record`, в тестах — подделка.
abstract class VoiceBackend {
  Future<bool> hasPermission();
  Future<void> start();
  Future<String?> stop();
  Future<void> cancel();
  Stream<double> get amplitude;
  void dispose();
}

class RecordVoiceBackend implements VoiceBackend {
  final AudioRecorder _recorder = AudioRecorder();

  @override
  Future<bool> hasPermission() => _recorder.hasPermission();

  @override
  Future<void> start() async {
    final dir = await getTemporaryDirectory();
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
  }

  @override
  Future<String?> stop() => _recorder.stop();

  @override
  Future<void> cancel() => _recorder.cancel();

  @override
  Stream<double> get amplitude => _recorder.onAmplitudeChanged(const Duration(milliseconds: 100)).map((a) => a.current);

  @override
  void dispose() => unawaited(_recorder.dispose());
}

enum VoiceState { idle, recording, locked }

/// Запись голосового как в Telegram: удержание, свайп влево — отмена, вверх — закрепить запись.
class VoiceRecorderController extends ChangeNotifier {
  VoiceRecorderController(this.backend, {this.minDuration = const Duration(milliseconds: 700), DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final VoiceBackend backend;
  final Duration minDuration;
  final DateTime Function() _clock;

  VoiceState state = VoiceState.idle;
  Duration elapsed = Duration.zero;

  /// Куда сдвинут палец (для подсказки «влево — отмена»).
  double dx = 0;
  double dy = 0;

  /// Последняя причина, по которой запись не началась или не ушла (показывается человеку).
  String? problem;

  final List<double> _levels = [];
  StreamSubscription<double>? _levelSub;
  Timer? _ticker;
  DateTime? _startedAt;
  bool _starting = false;

  bool get active => state != VoiceState.idle;
  bool get willCancel => state == VoiceState.recording && dx <= -_cancelDistance;
  bool get willLock => state == VoiceState.recording && dy <= -_lockDistance;

  /// Уровни громкости для живой волны во время записи (последние столбики).
  List<int> get liveWave => waveformFromDecibels(_levels.length > 36 ? _levels.sublist(_levels.length - 36) : _levels, bars: 24);

  Future<void> begin() async {
    if (active || _starting) return;
    _starting = true;
    problem = null;
    try {
      if (!await backend.hasPermission()) {
        problem = 'Нет доступа к микрофону — разрешите его в настройках телефона';
        notifyListeners();
        return;
      }
      await backend.start();
      state = VoiceState.recording;
      elapsed = Duration.zero;
      dx = dy = 0;
      _levels.clear();
      _startedAt = _clock();
      _levelSub = backend.amplitude.listen((db) => _levels.add(db), onError: (_) {});
      _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
        elapsed = _clock().difference(_startedAt!);
        notifyListeners();
      });
    } catch (_) {
      problem = 'Не удалось включить микрофон. Попробуйте ещё раз.';
      state = VoiceState.idle;
    } finally {
      _starting = false;
      notifyListeners();
    }
  }

  /// Палец сдвинулся относительно точки нажатия.
  void drag(double dx, double dy) {
    if (state != VoiceState.recording) return;
    this.dx = dx;
    this.dy = dy;
    notifyListeners();
  }

  /// Палец отпущен: отправить, отменить или закрепить запись (дальше — кнопки «Удалить» и «Отправить»).
  /// Возвращает готовую запись, только если её нужно отправить.
  Future<VoiceClip?> release() async {
    if (state != VoiceState.recording) return null;
    switch (releaseAction(dx: dx, dy: dy)) {
      case ReleaseAction.cancel:
        await cancel();
        return null;
      case ReleaseAction.lock:
        state = VoiceState.locked;
        dx = dy = 0;
        notifyListeners();
        return null;
      case ReleaseAction.send:
        return finish();
    }
  }

  /// Для скринридера и тех, кому неудобно удерживать: запись сразу «закреплена», дальше кнопки «Удалить» и «Отправить».
  Future<void> beginLocked() async {
    await begin();
    if (state == VoiceState.recording) {
      state = VoiceState.locked;
      notifyListeners();
    }
  }

  /// Остановить и вернуть запись; слишком короткую выбрасывает (случайное касание).
  Future<VoiceClip?> finish() async {
    if (!active) return null;
    final duration = _startedAt == null ? elapsed : _clock().difference(_startedAt!);
    final levels = List<double>.of(_levels);
    _teardown();
    String? path;
    try {
      path = await backend.stop();
    } catch (_) {
      path = null;
    }
    if (duration < minDuration) {
      problem = 'Удерживайте кнопку, пока говорите';
      notifyListeners();
      return null;
    }
    if (path == null || path.isEmpty) {
      problem = 'Не удалось сохранить запись. Попробуйте ещё раз.';
      notifyListeners();
      return null;
    }
    return VoiceClip(path: path, duration: duration, waveform: waveformFromDecibels(levels));
  }

  Future<void> cancel() async {
    if (!active) return;
    _teardown();
    try {
      await backend.cancel();
    } catch (_) {}
  }

  void _teardown() {
    _ticker?.cancel();
    _ticker = null;
    unawaited(_levelSub?.cancel());
    _levelSub = null;
    state = VoiceState.idle;
    dx = dy = 0;
    notifyListeners();
  }

  void clearProblem() {
    if (problem == null) return;
    problem = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _levelSub?.cancel();
    if (active) unawaited(backend.cancel().catchError((Object _) {}));
    backend.dispose();
    super.dispose();
  }
}
