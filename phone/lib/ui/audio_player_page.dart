import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';

import '../core/dates.dart';
import 'kit/kit.dart';

class AudioPlayerPage extends StatefulWidget {
  const AudioPlayerPage({super.key, required this.url, required this.title});
  final String url;
  final String title;

  @override
  State<AudioPlayerPage> createState() => _AudioPlayerPageState();
}

class _AudioPlayerPageState extends State<AudioPlayerPage> {
  final AudioPlayer _player = AudioPlayer();
  String? _error;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    try {
      await _player.setUrl(widget.url);
      await _player.play();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось включить запись');
    }
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  void _skip(int seconds) {
    final total = _player.duration ?? Duration.zero;
    var next = _player.position + Duration(seconds: seconds);
    if (next < Duration.zero) next = Duration.zero;
    if (total > Duration.zero && next > total) next = total;
    _player.seek(next);
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.title.isEmpty ? 'Запись' : widget.title;
    return DarkPage(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            children: [
              Row(
                children: [
                  HeaderButton(
                    icon: Icons.keyboard_arrow_down_rounded,
                    tooltip: 'Свернуть',
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const Expanded(
                    child: Text(
                      'Сейчас играет',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Color(0xB3FFFFFF)),
                    ),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
              const Spacer(),
              LayoutBuilder(
                builder: (context, constraints) {
                  final size = (constraints.maxWidth - 48).clamp(160.0, 300.0).toDouble();
                  return Container(
                    width: size,
                    height: size,
                    decoration: BoxDecoration(
                      gradient: crossTileGradient,
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(color: ChurchColors.amber.withValues(alpha: 0.25)),
                      boxShadow: [
                        BoxShadow(color: ChurchColors.amber.withValues(alpha: 0.18), blurRadius: 60),
                        const BoxShadow(color: Color(0x80000000), offset: Offset(0, 24), blurRadius: 40),
                      ],
                    ),
                    child: Center(child: CrossTile(size: size * 0.42, radius: size * 0.12)),
                  );
                },
              ),
              const SizedBox(height: 32),
              Text(
                title,
                textAlign: TextAlign.center,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: ChurchType.serifTitle.copyWith(fontSize: 26, color: Colors.white),
              ),
              const SizedBox(height: 6),
              const Text('Источник жизни', style: TextStyle(fontSize: 14, color: Color(0x99FFFFFF))),
              const Spacer(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Column(
                    children: [
                      Text(_error!, style: const TextStyle(color: Color(0xFFFFB4C0), fontSize: 15)),
                      TextButton(
                        style: TextButton.styleFrom(foregroundColor: ChurchColors.amber),
                        onPressed: () {
                          setState(() => _error = null);
                          _open();
                        },
                        child: const Text('Повторить'),
                      ),
                    ],
                  ),
                )
              else
                StreamBuilder<Duration>(
                  stream: _player.positionStream,
                  builder: (context, position) {
                    final total = _player.duration ?? Duration.zero;
                    final current = position.data ?? Duration.zero;
                    final max = total.inMilliseconds == 0 ? 1.0 : total.inMilliseconds.toDouble();
                    return Column(
                      children: [
                        Slider(
                          value: current.inMilliseconds.clamp(0, max.toInt()).toDouble(),
                          max: max,
                          semanticFormatterCallback: (_) => '${durationLabel(current.inSeconds)} из ${durationLabel(total.inSeconds)}',
                          onChanged: (value) => _player.seek(Duration(milliseconds: value.round())),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(_clock(current), style: const TextStyle(fontSize: 12.5, color: Color(0x99FFFFFF))),
                              Text(_clock(total), style: const TextStyle(fontSize: 12.5, color: Color(0x99FFFFFF))),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
              const SizedBox(height: 16),
              StreamBuilder<PlayerState>(
                stream: _player.playerStateStream,
                builder: (context, snapshot) {
                  final state = snapshot.data;
                  final playing = state?.playing ?? false;
                  final buffering = state?.processingState == ProcessingState.loading ||
                      state?.processingState == ProcessingState.buffering;
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        tooltip: 'Назад на 10 секунд',
                        iconSize: 34,
                        color: Colors.white,
                        onPressed: _error == null ? () => _skip(-10) : null,
                        icon: const Icon(Icons.replay_10_rounded),
                      ),
                      const SizedBox(width: 24),
                      Semantics(
                        button: true,
                        label: playing ? 'Пауза' : 'Играть',
                        excludeSemantics: true,
                        child: Material(
                          color: ChurchColors.creamButton,
                          shape: const CircleBorder(),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: _error != null ? null : () => playing ? _player.pause() : _player.play(),
                            child: SizedBox(
                              width: 76,
                              height: 76,
                              child: buffering
                                  ? const Padding(
                                      padding: EdgeInsets.all(26),
                                      child: CircularProgressIndicator(strokeWidth: 2.6, color: ChurchColors.amberInk),
                                    )
                                  : Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 40, color: ChurchColors.amberInk),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 24),
                      IconButton(
                        tooltip: 'Вперёд на 10 секунд',
                        iconSize: 34,
                        color: Colors.white,
                        onPressed: _error == null ? () => _skip(10) : null,
                        icon: const Icon(Icons.forward_10_rounded),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _clock(Duration value) {
  final label = durationLabel(value.inSeconds);
  return label.isEmpty ? '0:00' : label;
}
