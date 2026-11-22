import 'dart:async';

import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';

import '../logic/voice.dart';

/// Звук за интерфейсом: в приложении — `just_audio`, в тестах — подделка.
abstract class VoiceAudio {
  /// Загружает запись; возвращает длительность, если уже известна.
  Future<Duration?> load(String url);
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);
  Future<void> setSpeed(double speed);
  Stream<Duration> get position;
  Stream<bool> get playing;

  /// Запись доиграла до конца.
  Stream<void> get completed;
  void dispose();
}

class JustAudioVoice implements VoiceAudio {
  final AudioPlayer _player = AudioPlayer();

  @override
  Future<Duration?> load(String url) => _player.setUrl(url);

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration to) => _player.seek(to);

  @override
  Future<void> setSpeed(double speed) => _player.setSpeed(speed);

  @override
  Stream<Duration> get position => _player.positionStream;

  @override
  Stream<bool> get playing => _player.playingStream;

  @override
  Stream<void> get completed => _player.processingStateStream.where((s) => s == ProcessingState.completed);

  @override
  void dispose() => unawaited(_player.dispose());
}

/// Одновременно звучит одно голосовое: запуск нового останавливает прежнее.
class VoicePlayback extends ChangeNotifier {
  VoicePlayback._();
  static final VoicePlayback instance = VoicePlayback._();

  /// Подмена в тестах.
  static VoiceAudio Function() factory = JustAudioVoice.new;

  String? current;

  void claim(String id) {
    if (current == id) return;
    current = id;
    notifyListeners();
  }

  void release(String id) {
    if (current != id) return;
    current = null;
    notifyListeners();
  }
}

/// Голосовое сообщение в чате: кнопка, волна с перемоткой касанием, время и скорость 1× / 1,5× / 2×.
class VoiceMessagePlayer extends StatefulWidget {
  const VoiceMessagePlayer({super.key, required this.id, required this.url, required this.waveform, required this.durationHint, required this.color, required this.mutedColor, this.iconColor = Colors.white});

  /// Идентификатор сообщения: по нему различаем, какое голосовое сейчас звучит.
  final String id;
  final String url;
  final List<int> waveform;

  /// Длительность из сообщения (если сервер знает) — показываем до первого запуска.
  final Duration? durationHint;
  final Color color;
  final Color mutedColor;

  /// Цвет значка на кнопке (на светлой кнопке — тёмный).
  final Color iconColor;

  @override
  State<VoiceMessagePlayer> createState() => _VoiceMessagePlayerState();
}

class _VoiceMessagePlayerState extends State<VoiceMessagePlayer> {
  VoiceAudio? _audio;
  final _subs = <StreamSubscription<Object?>>[];
  Duration _position = Duration.zero;
  Duration? _duration;
  bool _playing = false;
  bool _loading = false;
  String? _error;
  double _speed = 1;

  @override
  void initState() {
    super.initState();
    _duration = widget.durationHint;
    VoicePlayback.instance.addListener(_onOther);
  }

  @override
  void dispose() {
    VoicePlayback.instance.removeListener(_onOther);
    VoicePlayback.instance.release(widget.id);
    for (final s in _subs) {
      s.cancel();
    }
    _audio?.dispose();
    super.dispose();
  }

  void _onOther() {
    if (VoicePlayback.instance.current != widget.id && _playing) _audio?.pause();
  }

  Future<VoiceAudio?> _ensure() async {
    final existing = _audio;
    if (existing != null) return existing;
    final audio = VoicePlayback.factory();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final total = await audio.load(widget.url);
      if (!mounted) {
        audio.dispose();
        return null;
      }
      _audio = audio;
      if (total != null && total > Duration.zero) _duration = total;
      _subs
        ..add(audio.position.listen((p) {
          if (mounted) setState(() => _position = p);
        }))
        ..add(audio.playing.listen((v) {
          if (mounted) setState(() => _playing = v);
        }))
        ..add(audio.completed.listen((_) async {
          await audio.pause();
          await audio.seek(Duration.zero);
          if (mounted) setState(() => _position = Duration.zero);
        }));
      await audio.setSpeed(_speed);
      return audio;
    } catch (_) {
      audio.dispose();
      if (mounted) setState(() => _error = 'Не удалось включить запись');
      return null;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle() async {
    final audio = await _ensure();
    if (audio == null) return;
    if (_playing) {
      await audio.pause();
      VoicePlayback.instance.release(widget.id);
    } else {
      VoicePlayback.instance.claim(widget.id);
      await audio.play();
    }
  }

  Future<void> _cycleSpeed() async {
    _speed = nextSpeed(_speed);
    setState(() {});
    await _audio?.setSpeed(_speed);
  }

  Future<void> _seekTo(double fraction) async {
    final total = _duration;
    if (total == null || total <= Duration.zero) return;
    final audio = await _ensure();
    if (audio == null) return;
    await audio.seek(total * fraction.clamp(0.0, 1.0));
  }

  @override
  Widget build(BuildContext context) {
    final total = _duration;
    final progress = total == null || total <= Duration.zero ? 0.0 : (_position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
    final shown = _playing || _position > Duration.zero ? (total == null ? _position : total - _position) : (total ?? Duration.zero);
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 200, maxWidth: 260),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: _playing ? 'Пауза' : 'Воспроизвести голосовое',
            child: GestureDetector(
              key: const ValueKey('voice-toggle'),
              onTap: _toggle,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color),
                alignment: Alignment.center,
                child: _loading
                    ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: widget.iconColor))
                    : Icon(_playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: widget.iconColor, size: 28),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                LayoutBuilder(
                  builder: (context, box) => GestureDetector(
                    key: const ValueKey('voice-wave'),
                    behavior: HitTestBehavior.opaque,
                    onTapDown: (d) => _seekTo(d.localPosition.dx / box.maxWidth),
                    onHorizontalDragUpdate: (d) => _seekTo(d.localPosition.dx / box.maxWidth),
                    child: SizedBox(height: 28, width: double.infinity, child: CustomPaint(painter: _WavePainter(widget.waveform, progress, widget.color, widget.mutedColor))),
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Expanded(
                      child: Text(_error ?? clockText(shown), key: const ValueKey('voice-time'), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: _error != null ? Colors.redAccent : widget.mutedColor)),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      key: const ValueKey('voice-speed'),
                      onTap: _cycleSpeed,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: widget.color.withValues(alpha: 0.16)),
                        child: Text(speedLabel(_speed), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: widget.color)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  _WavePainter(this.bars, this.progress, this.active, this.inactive);
  final List<int> bars;
  final double progress;
  final Color active;
  final Color inactive;

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;
    const gap = 2.0;
    final width = (size.width - gap * (bars.length - 1)) / bars.length;
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < bars.length; i++) {
      final h = (bars[i] / 100 * size.height).clamp(3.0, size.height);
      final x = i * (width + gap);
      paint.color = (i + 0.5) / bars.length <= progress ? active : inactive;
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, (size.height - h) / 2, width.clamp(1.5, 6.0), h), const Radius.circular(2)), paint);
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) => old.progress != progress || old.bars != bars || old.active != active;
}
