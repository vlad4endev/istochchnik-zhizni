import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title.isEmpty ? 'Запись' : widget.title)),
      body: Center(
        child: _error != null
            ? Text(_error!)
            : StreamBuilder<PlayerState>(
                stream: _player.playerStateStream,
                builder: (context, snapshot) {
                  final playing = snapshot.data?.playing ?? false;
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton.filled(
                        iconSize: 48,
                        onPressed: () => playing ? _player.pause() : _player.play(),
                        icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                      ),
                      const SizedBox(height: 16),
                      StreamBuilder<Duration>(
                        stream: _player.positionStream,
                        builder: (context, position) {
                          final total = _player.duration ?? Duration.zero;
                          final current = position.data ?? Duration.zero;
                          final max = total.inMilliseconds == 0 ? 1.0 : total.inMilliseconds.toDouble();
                          return Slider(
                            value: current.inMilliseconds.clamp(0, max.toInt()).toDouble(),
                            max: max,
                            onChanged: (value) => _player.seek(Duration(milliseconds: value.round())),
                          );
                        },
                      ),
                    ],
                  );
                },
              ),
      ),
    );
  }
}
