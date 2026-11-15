import 'package:audio_session/audio_session.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';

class CallPage extends StatefulWidget {
  const CallPage({
    super.key,
    this.callId,
    this.conversationId,
    this.recipientId,
    this.incoming = false,
    this.video = false,
    this.title = 'Звонок',
  });

  final String? callId;
  final String? conversationId;
  final int? recipientId;
  final bool incoming;
  final bool video;
  final String title;

  @override
  State<CallPage> createState() => _CallPageState();
}

class _CallPageState extends State<CallPage> {
  final Room _room = Room();
  SessionController? _session;
  String? _callId;
  String? _error;
  bool _connecting = false;
  bool _joined = false;
  bool _muted = false;
  bool _declined = false;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _callId = widget.callId;
    _room.addListener(_refresh);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _session ??= context.read<SessionController>();
    if (!_started && !widget.incoming) {
      _started = true;
      _connect();
    }
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _connect() async {
    if (_connecting || _joined) return;
    setState(() {
      _connecting = true;
      _error = null;
    });
    final session = _session ?? context.read<SessionController>();
    final api = ChurchApi(session);
    try {
      final session = await AudioSession.instance;
      await session.configure(const AudioSessionConfiguration.speech());
      if (widget.incoming && _callId != null) {
        await api.acceptCall(_callId!);
      } else if (_callId == null) {
        final created = await api.createCall(
          type: widget.recipientId != null ? 'direct' : 'group',
          mediaType: widget.video ? 'video' : 'audio',
          conversationId: widget.conversationId ?? '',
          recipientId: widget.recipientId,
        );
        _callId = str(asMap(created['call'])['id']);
        if (_callId == null || _callId!.isEmpty) {
          throw StateError('Сервер не вернул звонок');
        }
      }
      final tokenBody = await api.callToken(_callId!);
      final url = str(tokenBody['url']);
      final token = str(tokenBody['token']);
      if (url.isEmpty || token.isEmpty) {
        throw StateError('Сервер не выдал доступ в комнату звонка');
      }
      await _room.connect(url, token);
      await _room.localParticipant?.setMicrophoneEnabled(true);
      if (widget.video) {
        await _room.localParticipant?.setCameraEnabled(true);
      }
      if (!mounted) return;
      setState(() {
        _joined = true;
        _connecting = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = error is StateError ? error.message : describeDio(error);
      });
    }
  }

  Future<void> _hangUp() async {
    final id = _callId;
    try {
      await _room.disconnect();
    } catch (_) {}
    if (id != null && id.isNotEmpty && mounted) {
      try {
        await ChurchApi(context.read<SessionController>()).endCall(id);
      } catch (_) {}
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _decline() async {
    _declined = true;
    final id = _callId;
    if (id != null && mounted) {
      try {
        await ChurchApi(context.read<SessionController>()).declineCall(id);
      } catch (_) {}
    }
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _room.removeListener(_refresh);
    final id = _callId;
    final session = _session;
    final joined = _joined;
    final declined = _declined;
    _room.disconnect();
    if (joined && id != null && !declined && session != null) {
      ChurchApi(session).endCall(id).ignore();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final others = _room.remoteParticipants.length;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.call, size: 56),
              const SizedBox(height: 12),
              Text(
                _error ??
                    (_joined
                        ? (others == 0 ? 'Ждём собеседника' : 'В разговоре: $others')
                        : widget.incoming
                            ? 'Входящий звонок'
                            : 'Соединяем…'),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (widget.incoming && !_joined && _error == null)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FilledButton(onPressed: _connecting ? null : _connect, child: const Text('Ответить')),
                    const SizedBox(width: 12),
                    OutlinedButton(onPressed: _decline, child: const Text('Отклонить')),
                  ],
                )
              else ...[
                if (_error != null) FilledButton(onPressed: _connect, child: const Text('Повторить')),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton.filledTonal(
                      onPressed: !_joined
                          ? null
                          : () async {
                              final next = !_muted;
                              await _room.localParticipant?.setMicrophoneEnabled(!next);
                              setState(() => _muted = next);
                            },
                      icon: Icon(_muted ? Icons.mic_off : Icons.mic),
                    ),
                    const SizedBox(width: 16),
                    IconButton.filled(
                      style: IconButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
                      onPressed: _hangUp,
                      icon: const Icon(Icons.call_end),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
