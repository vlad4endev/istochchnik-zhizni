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
import '../../ui/widgets.dart' show showMessage;
import 'logic/call_access.dart';
import 'logic/call_layout.dart';
import 'logic/meeting_logic.dart';
import 'widgets/call_stage.dart';
import 'widgets/call_widgets.dart';

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
    this.inviteToken,
    this.inviteMedia,
    this.micOn = true,
    this.camOn = true,
    this.permissions = const DeviceCallPermissionGate(),
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

  /// Вход в чужую встречу по приглашению (`/call/join/<токен>`).
  final String? inviteToken;
  final MeetingMedia? inviteMedia;
  final bool micOn;
  final bool camOn;

  /// Запрос микрофона и камеры; подменяется в тестах.
  final CallPermissionGate permissions;

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
  bool _inviteOpen = true;
  CallLayoutMode _layout = CallLayoutMode.grid;
  EventsListener<RoomEvent>? _events;
  DateTime? _joinedAt;
  Timer? _ticker;
  bool _needSettings = false;
  bool _declined = false;
  bool _started = false;
  StreamSubscription<Map<String, dynamic>>? _callEvents;

  @override
  void initState() {
    super.initState();
    _callId = widget.callId;
    _muted = !(widget.meeting?.micOn ?? widget.micOn);
    _camOn = widget.meeting != null
        ? (widget.meeting!.media.isVideo && widget.meeting!.camOn)
        : widget.inviteToken != null
            ? ((widget.inviteMedia?.isVideo ?? false) && widget.camOn)
            : widget.video;
    _room.addListener(_refresh);
    // Подписки на треки, смена камеры/микрофона и «говорит» приходят событиями комнаты.
    _events = _room.createListener()..listen((_) => _refresh());
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
      final wantCamera = _camOn;
      final access = await widget.permissions.request(camera: wantCamera);
      final decision = decideCallAccess(mic: access.mic, cam: access.cam, wantCamera: wantCamera);
      if (!decision.canJoin) {
        if (!mounted) return;
        setState(() {
          _connecting = false;
          _needSettings = decision.offerSettings;
          _error = decision.error;
        });
        return;
      }
      if (wantCamera && !decision.useCamera) {
        _camOn = false;
        if (mounted && decision.notice != null) showMessage(context, decision.notice!);
      }
      _needSettings = false;
      final audio = await AudioSession.instance;
      await audio.configure(const AudioSessionConfiguration.speech());
      if (widget.incoming && _callId != null) {
        await api.acceptCall(_callId!);
      } else if (_callId == null && widget.inviteToken == null) {
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
      final Map<String, dynamic> tokenBody;
      if (widget.inviteToken != null && _callId == null) {
        tokenBody = await api.joinInvitation(widget.inviteToken!);
        _callId = str(asMap(tokenBody['call'])['id']);
      } else {
        tokenBody = await api.callToken(_callId!);
      }
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
        _joinedAt = DateTime.now();
      });
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _refresh());
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

  CallPerson _person(Participant p) {
    final pub = p.getTrackPublicationBySource(TrackSource.camera);
    final track = pub?.track;
    final cam = pub != null && !pub.muted && track is VideoTrack;
    final mic = p.getTrackPublicationBySource(TrackSource.microphone);
    final local = p is LocalParticipant;
    final me = _session?.user;
    final remoteName = widget.meeting == null && widget.inviteToken == null && widget.recipientId != null ? widget.title : '';
    final name = local ? (me?.displayName ?? 'Вы') : (p.name.trim().isNotEmpty ? p.name.trim() : (remoteName.isNotEmpty ? remoteName : 'Участник'));
    return CallPerson(
      identity: p.identity.isEmpty ? (local ? 'local' : p.sid.toString()) : p.identity,
      name: name,
      isLocal: local,
      micOn: mic != null && !mic.muted,
      camOn: cam,
      speaking: p.isSpeaking,
      video: cam ? track : null,
      quality: p.connectionQuality,
    );
  }

  List<CallPerson> _people() => [
        if (_room.localParticipant != null) _person(_room.localParticipant!),
        for (final p in _room.remoteParticipants.values) _person(p),
      ];

  Future<void> _hangUp({bool endForAll = false}) async {
    final id = _callId;
    try {
      await _room.disconnect();
    } catch (_) {}
    if (id != null && id.isNotEmpty && mounted) {
      try {
        await ChurchApi(context.read<SessionController>()).endCall(id, endForAll: endForAll);
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
    _ticker?.cancel();
    _events?.dispose();
    _room.removeListener(_refresh);
    final id = _callId;
    final session = _session;
    final joined = _joined;
    final declined = _declined;
    _room.disconnect();
    if (joined && id != null && !declined && session != null) {
      ChurchApi(session).endCall(id, endForAll: false).ignore();
    }
    super.dispose();
  }

  Future<void> _showParticipants() => showParticipantsSheet(
        context,
        people: _people(),
        inviteUrl: _inviteUrl,
        onCopyInvite: _inviteUrl == null ? null : () => unawaited(_copyInvite()),
      );

  String _statusText(int others, bool isMeeting) {
    final time = _joinedAt == null ? '' : callTimer(DateTime.now().difference(_joinedAt!));
    if (others == 0) return isMeeting ? 'Ждём участников' : 'Ждём собеседника…';
    return time;
  }

  Widget _controls(bool videoCall, bool isMeeting) {
    final host = widget.meeting != null;
    return CallControlsBar(
      children: [
        CallControl(
          icon: _muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          label: 'Микрофон',
          off: _muted,
          onTap: !_joined
              ? null
              : () async {
                  final next = !_muted;
                  await _room.localParticipant?.setMicrophoneEnabled(!next);
                  if (mounted) setState(() => _muted = next);
                },
        ),
        if (videoCall) CallControl(icon: _camOn ? Icons.videocam_rounded : Icons.videocam_off_rounded, label: 'Камера', off: !_camOn, onTap: _joined ? _toggleCamera : null),
        if (isMeeting) CallControl(icon: Icons.people_alt_rounded, label: 'Участники', badge: '${_room.remoteParticipants.length + 1}', onTap: _showParticipants),
        if (_inviteUrl != null) CallControl(icon: Icons.link_rounded, label: 'Ссылка', onTap: () => unawaited(_copyInvite())),
        if (host)
          PopupMenuButton<bool>(
            tooltip: 'Выход из встречи',
            offset: const Offset(0, -110),
            color: const Color(0xF51C1C1E),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            onSelected: (all) => _hangUp(endForAll: all),
            itemBuilder: (_) => const [
              PopupMenuItem(value: false, child: Text('Выйти из встречи', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
              PopupMenuItem(value: true, child: Text('Завершить для всех', style: TextStyle(color: Color(0xFFFF7A70), fontWeight: FontWeight.w600))),
            ],
            child: const IgnorePointer(child: CallControl(icon: Icons.call_end_rounded, label: 'Выйти', hangup: true, onTap: _noop)),
          )
        else
          CallControl(icon: Icons.call_end_rounded, label: 'Выйти', hangup: true, onTap: () => _hangUp(endForAll: !isMeeting)),
      ],
    );
  }

  static void _noop() {}

  @override
  Widget build(BuildContext context) {
    final others = _room.remoteParticipants.length;
    final isMeeting = widget.meeting != null || widget.inviteToken != null;
    final videoCall = widget.video || (widget.meeting?.media.isVideo ?? false) || (widget.inviteMedia?.isVideo ?? false);
    final title = widget.meeting != null ? _displayTitle : widget.title;
    if (_joined && _error == null) {
      final people = _people();
      final inviteBar = _inviteUrl != null && _inviteOpen && others == 0
          ? InviteBar(title: title, url: _inviteUrl!, copied: _linkCopied, onCopy: () => unawaited(_copyInvite()), onClose: () => setState(() => _inviteOpen = false))
          : null;
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: CallColors.bg,
          body: DefaultTextStyle.merge(
            style: const TextStyle(color: Colors.white, fontFamily: ChurchType.family),
            child: SafeArea(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: CallStage(
                      people: people,
                      title: title,
                      isMeeting: isMeeting,
                      isVideo: videoCall,
                      layout: _layout,
                      onLayout: (m) => setState(() => _layout = m),
                      statusText: _statusText(others, isMeeting),
                      inviteBar: inviteBar,
                    ),
                  ),
                  Positioned(left: 0, right: 0, bottom: 0, child: _controls(videoCall, isMeeting)),
                ],
              ),
            ),
          ),
        ),
      );
    }
    final ringing = widget.incoming && !_joined && _error == null;
    final status = _error ??
        (widget.incoming
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
              const Spacer(),
              _Pulse(active: _error == null, child: ChurchAvatar(name: title, size: 120)),
              const SizedBox(height: 28),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                child: Text(status, textAlign: TextAlign.center, style: TextStyle(fontSize: 15.5, color: _error != null ? const Color(0xFFFFB4C0) : const Color(0xB3FFFFFF))),
              ),
              const Spacer(),
              if (ringing)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _CallButton(icon: Icons.call_end_rounded, label: 'Отклонить', color: ChurchColors.danger, onTap: _decline),
                    _CallButton(icon: widget.video ? Icons.videocam_rounded : Icons.call_rounded, label: 'Ответить', color: ChurchColors.successBright, busy: _connecting, onTap: _connecting ? null : _connect),
                  ],
                )
              else ...[
                if (_error != null) ...[
                  if (_needSettings) ...[
                    _CallButton(icon: Icons.settings_rounded, label: 'Настройки', color: ChurchColors.amberBlob, onTap: () => widget.permissions.openSettings()),
                    const SizedBox(height: 16),
                  ],
                  _CallButton(icon: Icons.refresh_rounded, label: 'Повторить', color: Colors.white.withValues(alpha: 0.16), onTap: _connect),
                  const SizedBox(height: 20),
                ],
                _CallButton(icon: Icons.call_end_rounded, label: 'Завершить', color: ChurchColors.danger, onTap: _hangUp),
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
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
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
                  width: 68,
                  height: 68,
                  child: busy
                      ? const Padding(padding: EdgeInsets.all(22), child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : Icon(icon, color: Colors.white, size: 28),
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
