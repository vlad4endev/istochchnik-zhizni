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
import 'logic/call_status.dart';
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
  DateTime? _peerSince;
  Timer? _ticker;
  bool _needSettings = false;
  bool _declined = false;
  bool _leaving = false; // мы сами завершаем звонок
  bool _closing = false; // экран закрывается по сообщению (отклонён, завершён…)
  String _stage =
      ''; // что сейчас делает подключение — видно на экране, если оно долгое
  Timer? _poll;
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
    _events = _room.createListener()
      ..listen((event) {
        // Комнату закрыл сервер (собеседник отклонил или завершил) — не ждём сокет, закрываем сразу.
        if (event is RoomDisconnectedEvent &&
            _joined &&
            !_leaving &&
            !_closing) {
          _finish(
            event.reason == DisconnectReason.clientInitiated
                ? null
                : _disconnectMessage(event.reason),
          );
        }
        _refresh();
      });
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
    final message = endMessageForEvent(
      '${event['type'] ?? ''}',
      reason: event['reason'] == null ? null : '${event['reason']}',
    );
    if (message != null) _finish(message);
  }

  /// Закрыть экран звонка с понятным сообщением. Повторные сигналы (сокет, комната, опрос) игнорируются.
  void _finish(String? message) {
    if (_closing || _leaving || !mounted) return;
    _closing = true;
    _poll?.cancel();
    setState(() {
      _error = message ?? 'Звонок завершён';
      _connecting = false;
    });
    Future<void>.delayed(const Duration(milliseconds: 1300), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  String _disconnectMessage(DisconnectReason? reason) => switch (reason) {
    DisconnectReason.roomDeleted ||
    DisconnectReason.participantRemoved ||
    DisconnectReason.serverShutdown => 'Звонок завершён',
    _ => 'Связь со звонком потеряна',
  };

  /// Запасной путь: если событие сокета потерялось, состояние звонка узнаём у сервера.
  void _startPolling() {
    _poll?.cancel();
    // Для встреч звонок живёт, пока есть люди, — опрос не нужен.
    if (widget.meeting != null || widget.inviteToken != null) {
      return;
    }
    _poll = Timer.periodic(const Duration(seconds: 3), (_) async {
      final id = _callId;
      if (id == null || _closing || _leaving || !mounted) {
        return;
      }
      try {
        final status = await ChurchApi(
          _session ?? context.read<SessionController>(),
        ).callStatus(id);
        final message = endMessageForStatus(status);
        if (message != null) _finish(message);
      } catch (_) {
        /* нет сети — попробуем в следующий раз */
      }
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
      _setStage('Проверяем микрофон…');
      final access = await widget.permissions.request(camera: wantCamera);
      final decision = decideCallAccess(
        mic: access.mic,
        cam: access.cam,
        wantCamera: wantCamera,
      );
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
        if (mounted && decision.notice != null) {
          showMessage(context, decision.notice!);
        }
      }
      _needSettings = false;
      // Аудиосессия настраивается параллельно с запросом к серверу — так подключение идёт быстрее.
      final audioReady = _prepareAudio();
      if (widget.incoming && _callId != null) {
        _setStage('Принимаем звонок…');
        await Future.wait<void>([api.acceptCall(_callId!), audioReady]);
      } else if (_callId == null && widget.inviteToken == null) {
        _setStage(
          widget.recipientId != null ? 'Вызываем…' : 'Создаём встречу…',
        );
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
        await audioReady;
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
      if (widget.inviteToken != null) await audioReady;
      _setStage('Получаем доступ к комнате…');
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
      _setStage('Подключаемся к серверу звонков…');
      // Микрофон и камера включаются сразу при входе в комнату, а не отдельным шагом после неё;
      // долгое подключение не висит бесконечно — через полминуты предлагаем повторить.
      await _room
          .connect(
            url,
            token,
            fastConnectOptions: FastConnectOptions(
              microphone: TrackOption(enabled: !_muted),
              camera: TrackOption(enabled: _camOn),
            ),
          )
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () {
              unawaited(_room.disconnect());
              throw StateError(
                'Не удалось подключиться к звонку вовремя. Проверьте интернет и нажмите «Повторить».',
              );
            },
          );
      _setStage('Включаем звук…');
      await _room.localParticipant?.setMicrophoneEnabled(!_muted);
      if (_camOn) {
        await _room.localParticipant?.setCameraEnabled(true);
      }
      if (!mounted) return;
      setState(() {
        _joined = true;
        _connecting = false;
      });
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _refresh());
      _startPolling();
      if (_inviteUrl != null) unawaited(_copyInvite(announce: true));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = error is StateError ? error.message : describeDio(error);
      });
    }
  }

  Future<void> _prepareAudio() async {
    try {
      final audio = await AudioSession.instance;
      await audio.configure(const AudioSessionConfiguration.speech());
    } catch (_) {
      /* без аудиосессии звонок всё равно можно попробовать */
    }
  }

  void _setStage(String stage) {
    if (!mounted || _stage == stage) return;
    setState(() => _stage = stage);
  }

  String get _displayTitle =>
      _meetingTitle ??
      (widget.meeting?.title?.trim().isNotEmpty == true
          ? widget.meeting!.title!.trim()
          : (widget.meeting?.media.defaultTitle ?? widget.title));

  Future<void> _copyInvite({bool announce = false}) async {
    final url = _inviteUrl;
    if (url == null) return;
    final media =
        widget.meeting?.media ??
        (widget.video ? MeetingMedia.video : MeetingMedia.audio);
    await Clipboard.setData(
      ClipboardData(text: inviteShareText(_displayTitle, url, media: media)),
    );
    if (!mounted) return;
    setState(() => _linkCopied = true);
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(
        content: Text(
          announce
              ? 'Название и ссылка скопированы — отправьте участникам'
              : 'Ссылка скопирована',
        ),
      ),
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
    final remoteName =
        widget.meeting == null &&
            widget.inviteToken == null &&
            widget.recipientId != null
        ? widget.title
        : '';
    final name = local
        ? (me?.displayName ?? 'Вы')
        : (p.name.trim().isNotEmpty
              ? p.name.trim()
              : (remoteName.isNotEmpty ? remoteName : 'Участник'));
    return CallPerson(
      identity: p.identity.isEmpty
          ? (local ? 'local' : p.sid.toString())
          : p.identity,
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
    _leaving = true;
    _poll?.cancel();
    final id = _callId;
    try {
      await _room.disconnect();
    } catch (_) {}
    if (id != null && id.isNotEmpty && mounted) {
      try {
        await ChurchApi(context.read<SessionController>())
            .endCall(id, endForAll: endForAll);
      } catch (_) {}
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _decline() async {
    _declined = true;
    _leaving = true;
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
    _poll?.cancel();
    _leaving = true;
    _events?.dispose();
    _room.removeListener(_refresh);
    final id = _callId;
    final session = _session;
    final joined = _joined;
    final declined = _declined;
    // Комната освобождается после отключения: иначе её таймеры живут до закрытия приложения.
    unawaited(
      _room.disconnect().catchError((Object _) {}).whenComplete(_room.dispose),
    );
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
    if (others == 0) {
      _peerSince = null;
      return waitingStatus(
        direct: !isMeeting,
        outgoing: !widget.incoming && widget.recipientId != null,
      );
    }
    // Время разговора идёт с момента, когда ответил собеседник, а не когда мы вошли в комнату.
    _peerSince ??= DateTime.now();
    return callTimer(DateTime.now().difference(_peerSince!));
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
        if (videoCall)
          CallControl(
            icon: _camOn ? Icons.videocam_rounded : Icons.videocam_off_rounded,
            label: 'Камера',
            off: !_camOn,
            onTap: _joined ? _toggleCamera : null,
          ),
        if (isMeeting)
          CallControl(
            icon: Icons.people_alt_rounded,
            label: 'Участники',
            badge: '${_room.remoteParticipants.length + 1}',
            onTap: _showParticipants,
          ),
        if (_inviteUrl != null)
          CallControl(
            icon: Icons.link_rounded,
            label: 'Ссылка',
            onTap: () => unawaited(_copyInvite()),
          ),
        if (host)
          PopupMenuButton<bool>(
            tooltip: 'Выход из встречи',
            offset: const Offset(0, -110),
            color: const Color(0xF51C1C1E),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            onSelected: (all) => _hangUp(endForAll: all),
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: false,
                child: Text(
                  'Выйти из встречи',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              PopupMenuItem(
                value: true,
                child: Text(
                  'Завершить для всех',
                  style: TextStyle(
                    color: Color(0xFFFF7A70),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            child: const IgnorePointer(
              child: CallControl(
                icon: Icons.call_end_rounded,
                label: 'Выйти',
                hangup: true,
                onTap: _noop,
              ),
            ),
          )
        else
          CallControl(
            icon: Icons.call_end_rounded,
            label: 'Выйти',
            hangup: true,
            onTap: () => _hangUp(endForAll: !isMeeting),
          ),
      ],
    );
  }

  static void _noop() {}

  @override
  Widget build(BuildContext context) {
    final others = _room.remoteParticipants.length;
    final isMeeting = widget.meeting != null || widget.inviteToken != null;
    final videoCall =
        widget.video ||
        (widget.meeting?.media.isVideo ?? false) ||
        (widget.inviteMedia?.isVideo ?? false);
    final title = widget.meeting != null ? _displayTitle : widget.title;
    if (_joined && _error == null) {
      final people = _people();
      final inviteBar = _inviteUrl != null && _inviteOpen && others == 0
          ? InviteBar(
              title: title,
              url: _inviteUrl!,
              copied: _linkCopied,
              onCopy: () => unawaited(_copyInvite()),
              onClose: () => setState(() => _inviteOpen = false),
            )
          : null;
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: CallColors.bg,
          body: DefaultTextStyle.merge(
            style: const TextStyle(
              color: Colors.white,
              fontFamily: ChurchType.family,
            ),
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
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: _controls(videoCall, isMeeting),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    final ringing = widget.incoming && !_joined && _error == null;
    final status =
        _error ??
        (_connecting && _stage.isNotEmpty
            ? _stage
            : (widget.incoming ? 'Звонит вам…' : 'Соединяем…'));
    return DarkPage(
      child: SafeArea(
        // Короткие экраны и крупный шрифт: содержимое прокручивается, а на обычных — растягивается на всю высоту.
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
                  child: Column(
                    children: [
                      // Сверху — «Моя церковь» и тип звонка: сразу понятно, откуда и какой.
                      const _CallBrand(),
                      const SizedBox(height: 10),
                      Text(
                        ringing
                            ? (widget.video
                                  ? 'ВХОДЯЩИЙ ВИДЕОЗВОНОК'
                                  : 'ВХОДЯЩИЙ ЗВОНОК')
                            : isMeeting
                            ? (videoCall ? 'ВИДЕОВСТРЕЧА' : 'АУДИОВСТРЕЧА')
                            : (widget.video ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'),
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2.2,
                          color: Color(0xCCFFFFFF),
                        ),
                      ),
                      const Spacer(flex: 3),
                      _Pulse(
                        active: _error == null,
                        child: ChurchAvatar(name: title, size: 132, ring: true),
                      ),
                      const SizedBox(height: 32),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          status,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: _error != null
                                ? const Color(0xFFFFB4C0)
                                : const Color(0xB3FFFFFF),
                          ),
                        ),
                      ),
                      const Spacer(flex: 4),
                      if (ringing)
                        Row(
                          children: [
                            Expanded(
                              child: Center(
                                child: _CallButton(
                                  icon: Icons.call_end_rounded,
                                  label: 'Отклонить',
                                  color: const Color(0xFFE5484D),
                                  onTap: _decline,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Center(
                                child: _CallButton(
                                  icon: widget.video
                                      ? Icons.videocam_rounded
                                      : Icons.call_rounded,
                                  label: 'Ответить',
                                  color: const Color(0xFF2FBF71),
                                  busy: _connecting,
                                  onTap: _connecting ? null : _connect,
                                ),
                              ),
                            ),
                          ],
                        )
                      else ...[
                        if (_error != null) ...[
                          if (_needSettings) ...[
                            _CallButton(
                              icon: Icons.settings_rounded,
                              label: 'Настройки',
                              color: ChurchColors.amberBlob,
                              onTap: () => widget.permissions.openSettings(),
                            ),
                            const SizedBox(height: 16),
                          ],
                          _CallButton(
                            icon: Icons.refresh_rounded,
                            label: 'Повторить',
                            color: Colors.white.withValues(alpha: 0.16),
                            onTap: _connect,
                          ),
                          const SizedBox(height: 20),
                        ],
                        _CallButton(
                          icon: Icons.call_end_rounded,
                          label: 'Завершить',
                          color: const Color(0xFFE5484D),
                          onTap: _hangUp,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Логотип и название приложения над экраном звонка.
class _CallBrand extends StatelessWidget {
  const _CallBrand();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        ChurchLogo(size: 30),
        SizedBox(width: 10),
        Flexible(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              'МОЯ ЦЕРКОВЬ',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 2.4,
                color: ChurchColors.amber,
              ),
            ),
          ),
        ),
      ],
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
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

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
    final reduce = WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .disableAnimations;
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
                Builder(
                  builder: (context) {
                    final v = (t + offset) % 1;
                    return Container(
                      width: 130 + 90 * v,
                      height: 130 + 90 * v,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: ChurchColors.amber.withValues(
                            alpha: widget.active ? 0.35 * (1 - v) : 0,
                          ),
                        ),
                      ),
                    );
                  },
                ),
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
        // Нажатие по подписи тоже срабатывает: люди жмут и на «Ответить», а не только на кружок.
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
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
                    width: 78,
                    height: 78,
                    child: busy
                        ? const Padding(
                            padding: EdgeInsets.all(26),
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : Icon(icon, color: Colors.white, size: 32),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 124),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
