import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';

/// Круглая кнопка «вниз к последним сообщениям» со счётчиком новых — как в Telegram.
class ScrollDownButton extends StatelessWidget {
  const ScrollDownButton({super.key, required this.visible, required this.count, required this.onTap});

  final bool visible;

  /// Сколько новых сообщений пришло, пока смотрели историю (0 — счётчика нет).
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return AnimatedScale(
      scale: visible ? 1 : 0,
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      child: IgnorePointer(
        ignoring: !visible,
        child: Semantics(
          button: true,
          label: count > 0 ? 'К последним сообщениям, новых: $count' : 'К последним сообщениям',
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Material(
                color: palette.card,
                elevation: 3,
                shape: const CircleBorder(),
                child: InkWell(
                  key: const ValueKey('scroll-down'),
                  customBorder: const CircleBorder(),
                  onTap: onTap,
                  child: SizedBox(width: 44, height: 44, child: Icon(Icons.keyboard_arrow_down_rounded, size: 28, color: palette.inkMuted)),
                ),
              ),
              if (count > 0)
                Positioned(
                  top: -8,
                  right: -4,
                  child: Container(
                    key: const ValueKey('scroll-down-count'),
                    constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: palette.accent, borderRadius: BorderRadius.circular(10)),
                    child: Text(count > 99 ? '99+' : '$count', style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Полоса «Новые сообщения» перед первым непрочитанным.
class NewMessagesDivider extends StatelessWidget {
  const NewMessagesDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      key: const ValueKey('new-messages-divider'),
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.symmetric(vertical: 5),
      color: palette.accent.withValues(alpha: 0.12),
      alignment: Alignment.center,
      child: Text('Новые сообщения', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.accent)),
    );
  }
}
