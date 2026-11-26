import 'dart:ui';

import 'package:livekit_client/livekit_client.dart' show ConnectionQuality, VideoTrack, VideoTrackRenderer, VideoViewFit;
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/call_layout.dart';

/// Палитра окна звонка — как `calls.css` на сайте.
abstract final class CallColors {
  static const bg = Color(0xFF0E0F14);
  static const bgElevated = Color(0xFF171922);
  static const speak = Color(0xFF3B82F6);
  static const speakSoft = Color(0x593B82F6);
  static const brand = Color(0xFF7D3640);
  static const hangup = Color(0xFFE5251B);
  static const hangupLight = Color(0xFFFF5A4F);
  static const offText = Color(0xFFFF7A70);
}

/// Участник звонка для отрисовки (без привязки к LiveKit — удобно тестировать).
class CallPerson {
  const CallPerson({required this.identity, required this.name, this.isLocal = false, this.micOn = true, this.camOn = false, this.speaking = false, this.video, this.quality});

  final String identity;
  final String name;
  final bool isLocal;
  final bool micOn;
  final bool camOn;
  final bool speaking;
  final VideoTrack? video;
  final ConnectionQuality? quality;

  String get label => name.trim().isEmpty ? 'Участник' : name.trim();

  @override
  bool operator ==(Object other) => other is CallPerson && other.identity == identity;

  @override
  int get hashCode => identity.hashCode;
}

/// Плитка участника: видео или портрет с инициалами, внизу — плашка «микрофон + имя».
class ParticipantTile extends StatelessWidget {
  const ParticipantTile({super.key, required this.person, this.compact = false, this.fullBleed = false, this.portraitOnly = false});

  final CallPerson person;

  /// Маленькая плитка ленты (режим «Говорящий»).
  final bool compact;

  /// На весь экран без скруглений и плашки (видео собеседника в разговоре один на один).
  final bool fullBleed;

  /// Только круглый портрет с инициалами — без рамки и плашки с именем.
  final bool portraitOnly;

  @override
  Widget build(BuildContext context) {
    if (portraitOnly) return _Portrait(name: person.label, compact: false);
    final speaking = person.speaking;
    final radius = fullBleed ? 0.0 : (compact ? 16.0 : 22.0);
    return Semantics(
      container: true,
      label: '${person.label}${person.isLocal ? ' (вы)' : ''}. ${person.micOn ? (speaking ? 'Говорит' : 'Микрофон включён') : 'Микрофон выключен'}',
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: speaking
              ? const [BoxShadow(color: CallColors.speak, spreadRadius: 2), BoxShadow(color: CallColors.speakSoft, spreadRadius: 5)]
              : const [BoxShadow(color: Color(0x59000000), blurRadius: 24, offset: Offset(0, 10))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: Stack(
            fit: StackFit.expand,
            children: [
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment(-0.4, -1), end: Alignment(0.4, 1), colors: [Color(0xFF5A2A31), Color(0xFF3A1D28)]),
                ),
              ),
              if (person.video != null && person.camOn)
                VideoTrackRenderer(person.video!, fit: VideoViewFit.cover)
              else
                Center(child: _Portrait(name: person.label, compact: compact)),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: DecoratedBox(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0x8C000000), Color(0x1F000000), Color(0x00000000)], stops: [0, 0.55, 1]),
                  ),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(compact ? 6 : 10, compact ? 16 : 28, compact ? 6 : 10, compact ? 6 : 10),
                    child: Align(alignment: Alignment.bottomLeft, child: fullBleed ? const SizedBox.shrink() : _NamePill(person: person, compact: compact)),
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

class _Portrait extends StatelessWidget {
  const _Portrait({required this.name, required this.compact});

  final String name;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final size = (box.biggest.shortestSide * (compact ? 0.5 : 0.42)).clamp(36.0, 150.0);
        return Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(center: Alignment(-0.36, -0.44), radius: 1.1, colors: [Color(0xFFB0626D), CallColors.brand, Color(0xFF4A1F27)], stops: [0, 0.5, 1]),
            boxShadow: const [BoxShadow(color: Color(0x24FFFFFF), spreadRadius: 3), BoxShadow(color: Color(0x73000000), blurRadius: 36, offset: Offset(0, 16))],
          ),
          child: Text(initialsOf(name), style: TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: Colors.white)),
        );
      },
    );
  }
}

class _NamePill extends StatelessWidget {
  const _NamePill({required this.person, required this.compact});

  final CallPerson person;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final off = !person.micOn;
    return Container(
      constraints: const BoxConstraints(maxWidth: 220),
      padding: EdgeInsets.fromLTRB(3, 3, compact ? 8 : 10, 3),
      decoration: BoxDecoration(color: const Color(0x66000000), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: compact ? 18 : 22,
            height: compact ? 18 : 22,
            decoration: BoxDecoration(shape: BoxShape.circle, color: off ? const Color(0xE0FF3B30) : (person.speaking ? CallColors.speak : const Color(0x1FFFFFFF))),
            child: Icon(off ? Icons.mic_off_rounded : Icons.mic_rounded, size: compact ? 11 : 13, color: Colors.white),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              person.isLocal ? '${person.label} (вы)' : person.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: compact ? 11.5 : 12.8, fontWeight: FontWeight.w700, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

/// «+N» — свернувшиеся участники.
class OverflowTile extends StatelessWidget {
  const OverflowTile({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Ещё $count ${count == 1 ? 'участник' : 'участников'}',
      child: DecoratedBox(
        decoration: BoxDecoration(color: const Color(0x14FFFFFF), borderRadius: BorderRadius.circular(22), border: Border.all(color: const Color(0x1FFFFFFF))),
        child: Center(child: Text('+$count', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white))),
      ),
    );
  }
}

/// Столбики качества связи.
class SignalBars extends StatelessWidget {
  const SignalBars(this.quality, {super.key});

  final ConnectionQuality? quality;

  int get _level => switch (quality) {
        ConnectionQuality.excellent => 3,
        ConnectionQuality.good => 2,
        ConnectionQuality.poor => 1,
        _ => 0,
      };

  @override
  Widget build(BuildContext context) {
    final level = _level;
    final color = level == 1 ? const Color(0xFFFFB74D) : Colors.white;
    return Semantics(
      label: switch (quality) {
        ConnectionQuality.excellent => 'Связь отличная',
        ConnectionQuality.good => 'Связь хорошая',
        ConnectionQuality.poor => 'Связь слабая',
        ConnectionQuality.lost => 'Связь потеряна',
        _ => 'Качество связи неизвестно',
      },
      excludeSemantics: true,
      child: SizedBox(
        width: 16,
        height: 14,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var i = 1; i <= 3; i++) ...[
              Container(width: 4, height: 4.0 + i * 3, decoration: BoxDecoration(color: i <= level ? color : color.withValues(alpha: 0.28), borderRadius: BorderRadius.circular(1.5))),
              if (i < 3) const SizedBox(width: 1.5),
            ],
          ],
        ),
      ),
    );
  }
}

/// Верхняя строка встречи: название, качество связи, число участников, переключатель раскладки.
/// «Свернуть»: звонок остаётся, а приложение можно пользоваться — например, отправить ссылку в чат.
class MinimizeButton extends StatelessWidget {
  const MinimizeButton({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => IconButton(
        key: const ValueKey('call-minimize'),
        tooltip: 'Свернуть звонок',
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        onPressed: onTap,
        icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 30, color: Colors.white),
      );
}

class CallTopBar extends StatelessWidget {
  const CallTopBar({super.key, required this.title, required this.count, required this.layout, required this.onLayout, this.quality, this.statusText, this.onMinimize});

  /// Свернуть звонок: экран закрывается, а звонок продолжается (вернуться — по плашке сверху).
  final VoidCallback? onMinimize;

  final String title;
  final int count;
  final CallLayoutMode layout;
  final ValueChanged<CallLayoutMode> onLayout;
  final ConnectionQuality? quality;
  final String? statusText;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(onMinimize == null ? 16 : 4, 8, 12, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (onMinimize != null) MinimizeButton(onTap: onMinimize!),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16.8, fontWeight: FontWeight.w700, height: 1.25, letterSpacing: -0.15, color: Colors.white))),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (quality != null) ...[SignalBars(quality), const SizedBox(width: 8)],
                    const Icon(Icons.people_alt_outlined, size: 15, color: Color(0xCCFFFFFF)),
                    const SizedBox(width: 4),
                    Text('$count', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xCCFFFFFF))),
                    if (statusText != null) ...[const SizedBox(width: 10), Flexible(child: Text(statusText!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: Color(0xB3FFFFFF))))],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(color: const Color(0x14FFFFFF), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0x1AFFFFFF))),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _LayoutButton(icon: Icons.grid_view_rounded, label: 'Сетка', active: layout == CallLayoutMode.grid, onTap: () => onLayout(CallLayoutMode.grid)),
                _LayoutButton(icon: Icons.view_agenda_outlined, label: 'Говорящий крупно', active: layout == CallLayoutMode.speaker, onTap: () => onLayout(CallLayoutMode.speaker)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LayoutButton extends StatelessWidget {
  const _LayoutButton({required this.icon, required this.label, required this.active, required this.onTap});

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(9),
        onTap: onTap,
        child: Container(
          width: 44,
          height: 40,
          decoration: BoxDecoration(color: active ? const Color(0x29FFFFFF) : Colors.transparent, borderRadius: BorderRadius.circular(9)),
          child: Icon(icon, size: 19, color: active ? Colors.white : const Color(0xB3FFFFFF)),
        ),
      ),
    );
  }
}

/// Круглая кнопка нижней панели с подписью.
class CallControl extends StatelessWidget {
  const CallControl({super.key, required this.icon, required this.label, required this.onTap, this.off = false, this.hangup = false, this.badge});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  /// Выключено (микрофон/камера) — красноватая кнопка.
  final bool off;
  final bool hangup;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final size = hangup ? 52.0 : 48.0;
    final BoxDecoration deco = hangup
        ? const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [CallColors.hangupLight, CallColors.hangup]), boxShadow: [BoxShadow(color: Color(0x80FF3B30), blurRadius: 18, offset: Offset(0, 6))])
        : BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: off ? const [Color(0x57FF453A), Color(0x29FF453A)] : const [Color(0x33FFFFFF), Color(0x14FFFFFF)]),
            border: Border.all(color: off ? const Color(0x59FF5A50) : const Color(0x14FFFFFF)),
          );
    return Semantics(
      button: true,
      label: label,
      enabled: onTap != null,
      excludeSemantics: true,
      child: Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: InkResponse(
          onTap: onTap,
          radius: 34,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 44, maxWidth: 72),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(width: size, height: size, decoration: deco, child: Icon(icon, size: 23, color: off ? CallColors.offText : Colors.white)),
                    if (badge != null)
                      Positioned(
                        top: -2,
                        right: -2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(color: CallColors.speak, borderRadius: BorderRadius.circular(9)),
                          child: Text(badge!, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Colors.white)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: TextStyle(fontSize: 10.8, fontWeight: FontWeight.w600, color: off ? const Color(0xFFFF9D95) : const Color(0xB8FFFFFF)))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Нижняя панель управления: размытая тёмная «таблетка» как в вебе.
class CallControlsBar extends StatelessWidget {
  const CallControlsBar({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: media.textScaler.clamp(maxScaleFactor: 1.2)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(26),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
              decoration: BoxDecoration(color: const Color(0xC7161820), borderRadius: BorderRadius.circular(26), border: Border.all(color: const Color(0x1FFFFFFF))),
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [for (final c in children) Expanded(child: Center(child: c))]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Своя камера в углу при разговоре один на один.
class LocalPip extends StatelessWidget {
  const LocalPip({super.key, required this.track});

  final VideoTrack track;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Ваша камера',
      child: Container(
        width: 112,
        height: 150,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x59FFFFFF), width: 2), color: Colors.black),
        child: ClipRRect(borderRadius: BorderRadius.circular(12), child: VideoTrackRenderer(track, fit: VideoViewFit.cover)),
      ),
    );
  }
}

/// Ссылка-приглашение: на старте раскрыта, пока никто не подключился.
/// «Копировать» кладёт название и ссылку в буфер, «Поделиться» отправляет их в выбранные чаты.
class InviteBar extends StatelessWidget {
  const InviteBar({super.key, required this.title, required this.url, required this.copied, required this.onCopy, required this.onClose, this.onShare});

  final String title;
  final String url;
  final bool copied;
  final VoidCallback onCopy;
  final VoidCallback onClose;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 12),
      decoration: BoxDecoration(color: const Color(0xD1171922), borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0x1FFFFFFF))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Colors.white))),
              IconButton(tooltip: 'Скрыть', constraints: const BoxConstraints(minWidth: 44, minHeight: 40), onPressed: onClose, icon: const Icon(Icons.close_rounded, size: 20, color: Color(0xB3FFFFFF))),
            ],
          ),
          const Text('Отправьте ссылку участникам — они подключатся по ней', style: TextStyle(fontSize: 12.5, color: Color(0xB3FFFFFF))),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontFamily: 'monospace', color: Color(0xE6FFFFFF))),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    key: const ValueKey('invite-copy'),
                    style: FilledButton.styleFrom(backgroundColor: copied ? const Color(0x33FFFFFF) : CallColors.speak, minimumSize: const Size(44, 44), padding: const EdgeInsets.symmetric(horizontal: 10)),
                    onPressed: onCopy,
                    icon: Icon(copied ? Icons.check_rounded : Icons.link_rounded, size: 18),
                    label: FittedBox(fit: BoxFit.scaleDown, child: Text(copied ? 'Скопировано' : 'Копировать')),
                  ),
                ),
                if (onShare != null) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('invite-share'),
                      style: FilledButton.styleFrom(backgroundColor: CallColors.speak, minimumSize: const Size(44, 44), padding: const EdgeInsets.symmetric(horizontal: 10)),
                      onPressed: onShare,
                      icon: const Icon(Icons.send_rounded, size: 18),
                      label: const FittedBox(fit: BoxFit.scaleDown, child: Text('Поделиться')),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Лист «Участники»: список с состоянием микрофона/камеры и ссылкой для приглашения.
Future<void> showParticipantsSheet(BuildContext context, {required List<CallPerson> people, String? inviteUrl, VoidCallback? onCopyInvite, VoidCallback? onShareInvite}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: CallColors.bgElevated,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (context) => DefaultTextStyle.merge(
      style: const TextStyle(color: Colors.white, fontFamily: ChurchType.family),
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.75),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 10),
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: const Color(0x33FFFFFF), borderRadius: BorderRadius.circular(2)))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 8, 6),
                child: Row(
                  children: [
                    Expanded(child: Semantics(header: true, child: Text('Участники (${people.length})', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)))),
                    IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Color(0xB3FFFFFF))),
                  ],
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  children: [
                    for (final p in people)
                      ListTile(
                        key: ValueKey('person-${p.identity}'),
                        minTileHeight: 56,
                        leading: ChurchAvatar(name: p.label, size: 40),
                        title: Text(p.isLocal ? '${p.label} (вы)' : p.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white)),
                        subtitle: p.speaking ? const Text('Говорит', style: TextStyle(color: Color(0xFF7FB2FF))) : null,
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(p.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, size: 20, color: p.micOn ? const Color(0xB3FFFFFF) : const Color(0xFFFF6B60)),
                            const SizedBox(width: 12),
                            Icon(p.camOn ? Icons.videocam_rounded : Icons.videocam_off_rounded, size: 20, color: p.camOn ? const Color(0xB3FFFFFF) : const Color(0x66FFFFFF)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (inviteUrl != null && onCopyInvite != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Ссылка для приглашения', style: TextStyle(fontSize: 12.5, color: Color(0xB3FFFFFF))),
                      const SizedBox(height: 4),
                      Text(inviteUrl, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontFamily: 'monospace')),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(key: const ValueKey('sheet-copy'), style: FilledButton.styleFrom(backgroundColor: CallColors.speak, minimumSize: const Size(44, 48)), onPressed: onCopyInvite, icon: const Icon(Icons.link_rounded), label: const Text('Скопировать название и ссылку')),
                      ),
                      if (onShareInvite != null) ...[
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            key: const ValueKey('sheet-share'),
                            style: FilledButton.styleFrom(backgroundColor: CallColors.speak, minimumSize: const Size(44, 48)),
                            onPressed: () {
                              Navigator.pop(context);
                              onShareInvite();
                            },
                            icon: const Icon(Icons.send_rounded),
                            label: const Text('Поделиться в чатах'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}
