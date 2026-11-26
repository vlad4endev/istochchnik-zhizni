import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';

/// Движок воспроизведения. Отдельный интерфейс — чтобы плеер Библии проверялся без телефона.
abstract class AudioBackend {
  Stream<Duration> get position;
  Stream<Duration?> get duration;
  Stream<bool> get playing;

  /// Запись доиграла до конца.
  Stream<void> get completed;

  Future<void> load(String url, {Duration start = Duration.zero});
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);
  Future<void> setSpeed(double speed);
  Future<void> stop();
  Future<void> dispose();
}

/// Настоящий движок на just_audio. Создаётся только при первом включении озвучки.
class JustAudioBackend implements AudioBackend {
  JustAudioBackend() {
    unawaited(_configureSession());
  }

  final AudioPlayer _player = AudioPlayer();

  /// Озвучка — речь: система сама приглушит или поставит на паузу при звонке и других звуках.
  Future<void> _configureSession() async {
    try {
      final session = await AudioSession.instance;
      await session.configure(const AudioSessionConfiguration.speech());
    } catch (_) {}
  }

  @override
  Stream<Duration> get position => _player.positionStream;

  @override
  Stream<Duration?> get duration => _player.durationStream;

  @override
  Stream<bool> get playing => _player.playingStream;

  @override
  Stream<void> get completed => _player.processingStateStream.where((s) => s == ProcessingState.completed);

  @override
  Future<void> load(String url, {Duration start = Duration.zero}) async {
    await _player.setUrl(url, initialPosition: start == Duration.zero ? null : start);
  }

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration to) => _player.seek(to);

  @override
  Future<void> setSpeed(double speed) => _player.setSpeed(speed);

  @override
  Future<void> stop() => _player.stop();

  @override
  Future<void> dispose() => _player.dispose();
}
