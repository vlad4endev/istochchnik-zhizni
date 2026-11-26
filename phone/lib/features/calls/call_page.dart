import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart' show showMessage;
import '../chats/data/chat_source.dart';
import 'call_controller.dart';
import 'logic/call_access.dart';
import 'logic/meeting_logic.dart';
import 'widgets/call_stage.dart';
import 'widgets/call_widgets.dart';
import 'widgets/invite_share.dart';

/// Экран звонка. Сам звонок живёт в [CallController]: экран можно свернуть («Свернуть» или «Назад»),
/// и звонок продолжится — вернуться можно по плашке «Идёт звонок» сверху приложения.
/// Звонок заканчивается только по «Выйти» / «Завершить для всех» или когда его завершила другая сторона.
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
    this.controller,
    this.chatSource,
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

  /// Уже идущий звонок — вернуться к нему со свёрнутого экрана. Остальные параметры тогда не нужны.
  final CallController? controller;

  /// Откуда брать чаты для «Поделиться»; в приложении — сервер, в тестах подменяется.
  final ChatSource? chatSource;

  CallSpec get spec => CallSpec(
        callId: callId,
        conversationId: conversationId,
        recipientId: recipientId,
        incoming: incoming,
        autoAccept: autoAccept,
        video: video,
        title: title,
        meeting: meeting,
        inviteToken: inviteToken,
        inviteMedia: inviteMedia,
        micOn: micOn,
        camOn: camOn,
      );

  @override
  State<CallPage> createState() => _CallPageState();
}

class _CallPageState extends State<CallPage> {
  late final CallController _c;
  bool _popScheduled = false;
  bool _sharing = false;

  CallSpec get _spec => _c.spec;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _c = widget.controller ?? CallCenter.instance.begin(spec: widget.spec, session: session, permissions: widget.permissions);
    _c.addListener(_onChanged);
    _c.attach();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Исходящий звонок и вход по ссылке стартуют сразу, входящий — после «Ответить» (или уже принятый на звонилке).
    if (!_spec.incoming || _spec.autoAccept) _c.start();
  }

  @override
  void dispose() {
    _c.removeListener(_onChanged);
    // Звонок идёт — он продолжится свёрнутым; не начался — отменяется; закончился — освобождается.
    _c.detach();
    super.dispose();
  }

  void _onChanged() {
    if (!mounted) return;
    final notice = _c.takeNotice();
    if (notice != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) showMessage(context, notice);
      });
    }
    // Звонок закончила другая сторона: показываем причину и закрываем экран.
    if (_c.ended && _c.endedNotice != null && !_popScheduled) {
      _popScheduled = true;
      Future<void>.delayed(const Duration(milliseconds: 1300), () {
        if (mounted) Navigator.of(context).maybePop();
      });
    }
    setState(() {});
  }

  Future<void> _hangUp({bool endForAll = false}) async {
    await _c.hangUp(endForAll: endForAll);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _decline() async {
    await _c.decline();
    if (mounted) Navigator.of(context).pop();
  }

  /// Свернуть: экран закрывается, звонок продолжается.
  void _minimize() => Navigator.of(context).maybePop();

  Future<void> _copyInvite() async {
    final ok = await _c.copyInvite();
    if (!mounted || !ok) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Ссылка скопирована')));
  }

  /// «Поделиться»: выбрать чаты, и приглашение уйдёт туда само, от имени пользователя.
  Future<void> _shareInvite() async {
    final text = _c.inviteText;
    if (text == null || _sharing) return;
    _sharing = true;
    try {
      await shareInviteToChats(context, source: widget.chatSource ?? ChatApi(_c.session), text: text);
    } finally {
      _sharing = false;
    }
  }

  Future<void> _showParticipants() => showParticipantsSheet(
        context,
        people: _c.people(),
        inviteUrl: _c.inviteUrl,
        onCopyInvite: _c.inviteUrl == null ? null : () => unawaited(_copyInvite()),
        onShareInvite: _c.inviteUrl == null ? null : () => unawaited(_shareInvite()),
      );

  Widget _controls(bool videoCall, bool isMeeting) {
    final host = _spec.isHost;
    return CallControlsBar(
      children: [
        CallControl(
          icon: _c.muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          label: 'Микрофон',
          off: _c.muted,
          onTap: !_c.joined ? null : () => unawaited(_c.toggleMic()),
        ),
        if (videoCall)
          CallControl(
            icon: _c.camOn ? Icons.videocam_rounded : Icons.videocam_off_rounded,
            label: 'Камера',
            off: !_c.camOn,
            onTap: _c.joined ? () => unawaited(_c.toggleCamera()) : null,
          ),
        if (isMeeting)
          CallControl(
            icon: Icons.people_alt_rounded,
            label: 'Участники',
            badge: '${_c.othersCount + 1}',
            onTap: _showParticipants,
          ),
        if (_c.inviteUrl != null) ...[
          CallControl(icon: Icons.link_rounded, label: 'Ссылка', onTap: () => unawaited(_copyInvite())),
          CallControl(icon: Icons.send_rounded, label: 'Поделиться', onTap: () => unawaited(_shareInvite())),
        ],
        if (host)
          PopupMenuButton<bool>(
            tooltip: 'Выход из встречи',
            offset: const Offset(0, -110),
            color: const Color(0xF51C1C1E),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            onSelected: (all) => _hangUp(endForAll: all),
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: false,
                child: Text('Выйти из встречи', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ),
              PopupMenuItem(
                value: true,
                child: Text('Завершить для всех', style: TextStyle(color: Color(0xFFFF7A70), fontWeight: FontWeight.w600)),
              ),
            ],
            child: const IgnorePointer(
              child: CallControl(icon: Icons.call_end_rounded, label: 'Выйти', hangup: true, onTap: _noop),
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
    // Любое закрытие экрана при идущем звонке (кнопка, «Назад», жест) — это «свернуть»: плашка появляется сразу.
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) _c.markMinimizing();
      },
      child: _screen(context),
    );
  }

  Widget _screen(BuildContext context) {
    final others = _c.othersCount;
    final isMeeting = _spec.isMeeting;
    final videoCall = _spec.videoCall;
    final title = _c.screenTitle;
    if (_c.joined && _c.error == null) {
      final people = _c.people();
      final inviteBar = _c.inviteUrl != null && _c.inviteOpen && others == 0
          ? InviteBar(
              title: title,
              url: _c.inviteUrl!,
              copied: _c.linkCopied,
              onCopy: () => unawaited(_copyInvite()),
              onShare: () => unawaited(_shareInvite()),
              onClose: _c.closeInviteBar,
            )
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
                      layout: _c.layout,
                      onLayout: _c.setLayout,
                      statusText: _c.statusText(),
                      inviteBar: inviteBar,
                      onMinimize: _minimize,
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
    final ringing = _spec.incoming && !_c.joined && _c.error == null;
    final status = _c.error ?? (_c.connecting && _c.stage.isNotEmpty ? _c.stage : (_spec.incoming ? 'Звонит вам…' : 'Соединяем…'));
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
                            ? (_spec.video ? 'ВХОДЯЩИЙ ВИДЕОЗВОНОК' : 'ВХОДЯЩИЙ ЗВОНОК')
                            : isMeeting
                                ? (videoCall ? 'ВИДЕОВСТРЕЧА' : 'АУДИОВСТРЕЧА')
                                : (_spec.video ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'),
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 2.2, color: Color(0xCCFFFFFF)),
                      ),
                      const Spacer(flex: 3),
                      _Pulse(
                        active: _c.error == null,
                        child: ChurchAvatar(name: title, size: 132, ring: true),
                      ),
                      const SizedBox(height: 32),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.15),
                      ),
                      const SizedBox(height: 10),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          status,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 16, color: _c.error != null ? const Color(0xFFFFB4C0) : const Color(0xB3FFFFFF)),
                        ),
                      ),
                      const Spacer(flex: 4),
                      if (ringing)
                        Row(
                          children: [
                            Expanded(
                              child: Center(
                                child: _CallButton(icon: Icons.call_end_rounded, label: 'Отклонить', color: const Color(0xFFE5484D), onTap: _decline),
                              ),
                            ),
                            Expanded(
                              child: Center(
                                child: _CallButton(
                                  icon: _spec.video ? Icons.videocam_rounded : Icons.call_rounded,
                                  label: 'Ответить',
                                  color: const Color(0xFF2FBF71),
                                  busy: _c.connecting,
                                  onTap: _c.connecting ? null : _c.connect,
                                ),
                              ),
                            ),
                          ],
                        )
                      else ...[
                        if (_c.error != null) ...[
                          if (_c.needSettings) ...[
                            _CallButton(icon: Icons.settings_rounded, label: 'Настройки', color: ChurchColors.amberBlob, onTap: () => _c.permissions.openSettings()),
                            const SizedBox(height: 16),
                          ],
                          _CallButton(icon: Icons.refresh_rounded, label: 'Повторить', color: Colors.white.withValues(alpha: 0.16), onTap: _c.connect),
                          const SizedBox(height: 20),
                        ],
                        _CallButton(icon: Icons.call_end_rounded, label: 'Завершить', color: const Color(0xFFE5484D), onTap: _hangUp),
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
