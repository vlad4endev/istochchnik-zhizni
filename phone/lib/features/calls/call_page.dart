import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';

class CallPage extends StatefulWidget {
  const CallPage({
    super.key,
    this.callId,
    this.conversationId,
    this.recipientId,
    this.incoming = false,
    this.autoAccept = false,
    this.video = false,
    this.title = 'Звонок',
  });

  final String? callId;
  final String? conversationId;
  final int? recipientId;
  final bool incoming;

  /// Звонок уже принят на системной звонилке — соединяем без второго «Ответить».
  final bool autoAccept;
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
  StreamSubscription<Map<String, dynamic>>? _callEvents;

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
    _callEvents ??= _session!.realtime.callEvents.listen(_onCallEvent);
    if (!_started && (!widget.incoming || widget.autoAccept)) {
      _started = true;
      _connect();
    }
  }

  void _onCallEvent(Map<String, dynamic> event) {
    final id = '${event['callId'] ?? ''}';
    if (id.isEmpty || id != _callId || !mounted) return;
    final type = '${event['type'] ?? ''}';
    final message = switch (type) {
      'call:cancelled' => 'Звонок отменён',
      'call:rejected' => 'Собеседник отклонил звонок',
      'call:ended' => 'Звонок завершён',
      _ => null,
    };
    if (message == null) return;
    // Завершение на время переподключения LiveKit сервер не шлёт, поэтому закрываем сразу.
    setState(() => _error = message);
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) Navigator.of(context).maybePop();
    });
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
    _callEvents?.cancel();
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
    final ringing = widget.incoming && !_joined && _error == null;
    final status = _error ??
        (_joined
            ? (others == 0 ? 'Ждём собеседника…' : (others == 1 ? 'Идёт разговор' : 'В разговоре: $others'))
            : widget.incoming
                ? (widget.video ? 'Входящий видеозвонок' : 'Входящий звонок')
                : 'Соединяем…');
    return DarkPage(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
          child: Column(
            children: [
              Text(
                ringing ? (widget.video ? 'ВХОДЯЩИЙ ВИДЕОЗВОНОК' : 'ВХОДЯЩИЙ ЗВОНОК') : (widget.video ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 2.2, color: ChurchColors.amber),
              ),
              const Spacer(),
              _Pulse(active: !_joined && _error == null, child: ChurchAvatar(name: widget.title, size: 120)),
              const SizedBox(height: 28),
              Text(
                widget.title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.4),
              ),
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                child: Text(
                  status,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15.5, color: _error != null ? const Color(0xFFFFB4C0) : const Color(0xB3FFFFFF)),
                ),
              ),
              const Spacer(),
              if (ringing)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _CallButton(
                      icon: Icons.call_end_rounded,
                      label: 'Отклонить',
                      color: ChurchColors.danger,
                      onTap: _decline,
                    ),
                    _CallButton(
                      icon: widget.video ? Icons.videocam_rounded : Icons.call_rounded,
                      label: 'Ответить',
                      color: ChurchColors.successBright,
                      busy: _connecting,
                      onTap: _connecting ? null : _connect,
                    ),
                  ],
                )
              else ...[
                if (_error != null) ...[
                  _CallButton(icon: Icons.refresh_rounded, label: 'Повторить', color: Colors.white.withValues(alpha: 0.16), onTap: _connect),
                  const SizedBox(height: 20),
                ],
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _CallButton(
                        icon: _muted ? Icons.mic_off_rounded : Icons.mic_none_rounded,
                        label: _muted ? 'Включить' : 'Микрофон',
                        color: _muted ? Colors.white : Colors.white.withValues(alpha: 0.14),
                        iconColor: _muted ? ChurchColors.night : Colors.white,
                        size: 60,
                        onTap: !_joined
                            ? null
                            : () async {
                                final next = !_muted;
                                await _room.localParticipant?.setMicrophoneEnabled(!next);
                                setState(() => _muted = next);
                              },
                      ),
                      const SizedBox(width: 28),
                      _CallButton(
                        icon: Icons.call_end_rounded,
                        label: 'Завершить',
                        color: ChurchColors.danger,
                        size: 60,
                        onTap: _hangUp,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse({required this.child, required this.active});
  final Widget child;
  final bool active;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant _Pulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    final reduce = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    if (widget.active && !reduce) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      height: 220,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = _controller.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              for (final offset in const [0.0, 0.5])
                Builder(builder: (context) {
                  final v = (t + offset) % 1;
                  return Container(
                    width: 130 + 90 * v,
                    height: 130 + 90 * v,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: ChurchColors.amber.withValues(alpha: widget.active ? 0.35 * (1 - v) : 0)),
                    ),
                  );
                }),
              child!,
            ],
          );
        },
        child: widget.child,
      ),
    );
  }
}

class _CallButton extends StatelessWidget {
  const _CallButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.iconColor = Colors.white,
    this.size = 68,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color iconColor;
  final VoidCallback? onTap;
  final double size;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      enabled: onTap != null,
      excludeSemantics: true,
      child: Opacity(
        opacity: onTap == null && !busy ? 0.45 : 1,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Material(
              color: color,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: SizedBox(
                  width: size,
                  height: size,
                  child: busy
                      ? const Padding(padding: EdgeInsets.all(22), child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : Icon(icon, color: iconColor, size: size * 0.42),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
          ],
        ),
      ),
    );
  }
}
