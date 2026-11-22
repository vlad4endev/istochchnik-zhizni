import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';

/// Панель закреплённого под шапкой чата, как в Telegram: тап — перейти к сообщению,
/// а если закреплённых несколько — следующий тап показывает следующее («2 из 3»).
class PinnedBar extends StatelessWidget {
  const PinnedBar({super.key, required this.pinned, required this.index, required this.onTap, this.onClose});

  final List<ChatMessage> pinned;

  /// Какое по счёту показано (с нуля).
  final int index;

  /// Нажали на панель: перейти к сообщению [pinned]`[index]`.
  final VoidCallback onTap;

  /// Если можно открепить (есть право) — крестик убирает закреплённое.
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    if (pinned.isEmpty) return const SizedBox.shrink();
    final palette = context.palette;
    final i = index.clamp(0, pinned.length - 1);
    final message = pinned[i];
    final title = pinned.length > 1 ? 'Закреплённое сообщение · ${i + 1} из ${pinned.length}' : 'Закреплённое сообщение';
    return Material(
      color: palette.card,
      child: InkWell(
        key: const ValueKey('pinned-bar'),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: palette.outline.withValues(alpha: 0.5)))),
          child: Row(
            children: [
              Container(width: 3, height: 34, decoration: BoxDecoration(color: palette.accent, borderRadius: BorderRadius.circular(2))),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.accent)),
                    Text(messageSummary(message), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: palette.ink)),
                  ],
                ),
              ),
              Icon(Icons.push_pin, size: 18, color: palette.inkFaint),
              if (onClose != null)
                IconButton(
                  key: const ValueKey('pinned-unpin'),
                  tooltip: 'Открепить',
                  icon: Icon(Icons.close_rounded, size: 20, color: palette.inkMuted),
                  onPressed: onClose,
                )
              else
                const SizedBox(width: 10),
            ],
          ),
        ),
      ),
    );
  }
}
