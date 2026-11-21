import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import 'logic/meeting_logic.dart';

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
    this.meeting,
  });

  final String? callId;
  final String? conversationId;
  final int? recipientId;
  final bool incoming;

  /// Звонок уже принят на системной звонилке — соединяем без второго «Ответить».
  final bool autoAccept;
  final bool video;
  final String title;

  /// Новая конференция по ссылке (из чата или отдельная встреча).
  final MeetingLaunch? meeting;

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
  late bool _camOn = widget.video || (widget.meeting?.media.isVideo ?? false);
  String? _inviteUrl;
  String? _meetingTitle;
  bool _linkCopied = false;
  bool _declined = false;
  bool _started = false;
  StreamSubscription<Map<String, dynamic>>? _callEvents;

  @override
  void initState() {
    super.initState();
    _callId = widget.callId;
    _muted = !(widget.meeting?.micOn ?? true);
    _camOn = widget.meeting != null ? (widget.meeting!.media.isVideo && widget.meeting!.camOn) : widget.video;
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
      final audio = await AudioSession.instance;
      await audio.configure(const AudioSessionConfiguration.speech());
      if (widget.incoming && _callId != null) {
        await api.acceptCall(_callId!);
      } else if (_callId == null) {
        final meeting = widget.meeting;
        final created = meeting != null
            ? await api.createCall(
                type: 'group',
                mediaType: meeting.media.apiValue,
                conversationId: meeting.conversationId ?? '',
                accessMode: 'link',
                standalone: meeting.standalone,
                title: cleanMeetingTitle(meeting.title),
              )
            : await api.createCall(
                type: widget.recipientId != null ? 'direct' : 'group',
                mediaType: widget.video ? 'video' : 'audio',
                conversationId: widget.conversationId ?? '',
                recipientId: widget.recipientId,
              );
        final call = asMap(created['call']);
        _callId = str(call['id']);
        if (_callId == null || _callId!.isEmpty) {
          throw StateError('Сервер не вернул звонок');
        }
        final invite = str(call['inviteUrl']);
        if (invite.isNotEmpty) {
          _inviteUrl = absoluteInviteUrl(invite, session.apiOrigin);
          final title = str(call['title']);
          _meetingTitle = title.isNotEmpty ? title : null;
        }
      }
      final tokenBody = await api.callToken(_callId!);
      final url = str(tokenBody['url']);
      final token = str(tokenBody['token']);
      if (url.isEmpty || token.isEmpty) {
        throw StateError('Сервер не выдал доступ в комнату звонка');
      }
      await _room.connect(url, token);
      await _room.localParticipant?.setMicrophoneEnabled(!_muted);
      if (_camOn) {
        await _room.localParticipant?.setCameraEnabled(true);
      }
      if (!mounted) return;
      setState(() {
        _joined = true;
        _connecting = false;
      });
      if (_inviteUrl != null) unawaited(_copyInvite(announce: true));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = error is StateError ? error.message : describeDio(error);
      });
    }
  }

  String get _displayTitle => _meetingTitle ?? (widget.meeting?.title?.trim().isNotEmpty == true ? widget.meeting!.title!.trim() : (widget.meeting?.media.defaultTitle ?? widget.title));

  Future<void> _copyInvite({bool announce = false}) async {
    final url = _inviteUrl;
    if (url == null) return;
    final media = widget.meeting?.media ?? (widget.video ? MeetingMedia.video : MeetingMedia.audio);
    await Clipboard.setData(ClipboardData(text: inviteShareText(_displayTitle, url, media: media)));
    if (!mounted) return;
    setState(() => _linkCopied = true);
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(announce ? 'Название и ссылка скопированы — отправьте участникам' : 'Ссылка скопирована')),
    );
  }

  Future<void> _toggleCamera() async {
    final next = !_camOn;
    await _room.localParticipant?.setCameraEnabled(next);
    if (mounted) setState(() => _camOn = next);
  }

  List<VideoTrack> _videoTracks() {
    final tracks = <VideoTrack>[];
    final participants = <Participant>[?_room.localParticipant, ..._room.remoteParticipants.values];
    for (final participant in participants) {
      for (final pub in participant.videoTrackPublications) {
        final track = pub.track;
        if (track is VideoTrack && !pub.muted) tracks.add(track);
      }
    }
    return tracks;
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
    final isMeeting = widget.meeting != null;
    final videoCall = widget.video || (widget.meeting?.media.isVideo ?? false);
    final tracks = _joined && videoCall ? _videoTracks() : const <VideoTrack>[];
    final title = isMeeting ? _displayTitle : widget.title;
    final ringing = widget.incoming && !_joined && _error == null;
    final status = _error ??
        (_joined
            ? (others == 0 ? (isMeeting ? 'Ждём участников — отправьте ссылку' : 'Ждём собеседника…') : (others == 1 ? 'Идёт разговор' : 'В разговоре: $others'))
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
                ringing
                    ? (widget.video ? 'ВХОДЯЩИЙ ВИДЕОЗВОНОК' : 'ВХОДЯЩИЙ ЗВОНОК')
                    : isMeeting
                        ? (videoCall ? 'ВИДЕОВСТРЕЧА' : 'АУДИОВСТРЕЧА')
                        : (widget.video ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 2.2, color: ChurchColors.amber),
              ),
              if (tracks.isNotEmpty)
                Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: _VideoGrid(tracks: tracks)))
              else ...[
                const Spacer(),
                _Pulse(active: !_joined && _error == null, child: ChurchAvatar(name: title, size: 120)),
                const SizedBox(height: 28),
              ],
              Text(
                title,
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
              if (_inviteUrl != null) ...[
                const SizedBox(height: 16),
                _InviteBar(url: _inviteUrl!, copied: _linkCopied, onCopy: _copyInvite),
              ],
              if (tracks.isEmpty) const Spacer() else const SizedBox(height: 16),
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
                      if (videoCall) ...[
                        const SizedBox(width: 20),
                        _CallButton(
                          icon: _camOn ? Icons.videocam_rounded : Icons.videocam_off_rounded,
                          label: _camOn ? 'Камера' : 'Включить',
                          color: _camOn ? Colors.white.withValues(alpha: 0.14) : Colors.white,
                          iconColor: _camOn ? Colors.white : ChurchColors.night,
                          size: 60,
                          onTap: _joined ? _toggleCamera : null,
                        ),
                      ],
                      const SizedBox(width: 20),
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

class _InviteBar extends StatelessWidget {
  const _InviteBar({required this.url, required this.copied, required this.onCopy});

  final String url;
  final bool copied;
  final Future<void> Function({bool announce}) onCopy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Скопировать ссылку-приглашение',
      excludeSemantics: true,
      child: Material(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => onCopy(),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                children: [
                  Icon(copied ? Icons.check_rounded : Icons.link_rounded, size: 20, color: ChurchColors.amber),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, color: Colors.white)),
                  ),
                  const SizedBox(width: 8),
                  Text(copied ? 'Скопировано' : 'Копировать', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ChurchColors.amber)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VideoGrid extends StatelessWidget {
  const _VideoGrid({required this.tracks});

  final List<VideoTrack> tracks;

  @override
  Widget build(BuildContext context) {
    final columns = tracks.length <= 1 ? 1 : 2;
    return LayoutBuilder(
      builder: (context, box) {
        final rows = (tracks.length / columns).ceil();
        const gap = 8.0;
        final tileW = (box.maxWidth - gap * (columns - 1)) / columns;
        final tileH = (box.maxHeight - gap * (rows - 1)) / rows;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          alignment: WrapAlignment.center,
          runAlignment: WrapAlignment.center,
          children: [
            for (final track in tracks)
              SizedBox(
                width: tileW,
                height: tileH.clamp(80.0, double.infinity),
                child: ClipRRect(borderRadius: BorderRadius.circular(18), child: VideoTrackRenderer(track)),
              ),
          ],
        );
      },
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
