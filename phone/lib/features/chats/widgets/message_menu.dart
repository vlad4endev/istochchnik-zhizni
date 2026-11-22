import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../prayer/widgets/sheet_frame.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';
import 'emoji_panel.dart';

enum MessageCommand { reply, edit, delete, forward, copy, readers, pin, unpin, select }

/// Что выбрал человек в меню: реакцию или действие.
class MenuChoice {
  const MenuChoice.reaction(String this.emoji) : command = null;
  const MenuChoice.command(MessageCommand this.command) : emoji = null;
  final String? emoji;
  final MessageCommand? command;
}

/// Меню сообщения: сверху быстрые реакции (и «+» для любого эмодзи), ниже действия — как на сайте.
Future<MenuChoice?> showMessageMenu(BuildContext context, {required ChatMessage message, required MessageActions actions}) {
  return showModalBottomSheet<MenuChoice>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheet) => _MenuSheet(message: message, actions: actions),
  );
}

class _MenuSheet extends StatelessWidget {
  const _MenuSheet({required this.message, required this.actions});
  final ChatMessage message;
  final MessageActions actions;

  Future<void> _more(BuildContext context) async {
    final emoji = await showReactionPicker(context);
    if (emoji != null && context.mounted) Navigator.pop(context, MenuChoice.reaction(emoji));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final media = MediaQuery.of(context);
    final mineReactions = {for (final r in message.reactions) if (r.byMe) r.emoji};
    Widget row(IconData icon, String label, MessageCommand command, {bool danger = false}) => ListRow(
          leading: Icon(icon, color: danger ? ChurchColors.danger : palette.inkMuted, size: 24),
          title: label,
          titleColor: danger ? ChurchColors.danger : null,
          chevron: false,
          onTap: () => Navigator.pop(context, MenuChoice.command(command)),
        );
    return Container(
      constraints: BoxConstraints(maxHeight: media.size.height * 0.9),
      decoration: BoxDecoration(color: palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
      child: Material(
        type: MaterialType.transparency,
        child: SingleChildScrollView(
          padding: EdgeInsets.only(bottom: 12 + media.padding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 10),
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: palette.outline, borderRadius: BorderRadius.circular(2)))),
              if (actions.react) ...[
                const SizedBox(height: 10),
                SizedBox(
                  height: 56,
                  child: Row(
                    children: [
                      // Быстрые реакции прокручиваются, а «+» (любой эмодзи) всегда под рукой справа.
                      Expanded(
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.only(left: 12),
                          children: [
                            for (final emoji in quickReactions)
                              Semantics(
                                button: true,
                                selected: mineReactions.contains(emoji),
                                label: 'Реакция $emoji',
                                excludeSemantics: true,
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(99),
                                  onTap: () => Navigator.pop(context, MenuChoice.reaction(emoji)),
                                  child: Container(
                                    width: 48,
                                    height: 48,
                                    margin: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: mineReactions.contains(emoji) ? palette.accent.withValues(alpha: 0.2) : palette.card,
                                      border: mineReactions.contains(emoji) ? Border.all(color: palette.accent, width: 1.4) : null,
                                    ),
                                    child: Text(emoji, style: const TextStyle(fontSize: 26)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(left: 2, right: 12),
                        child: Tooltip(
                          message: 'Другие реакции',
                          child: InkWell(
                            borderRadius: BorderRadius.circular(99),
                            onTap: () => _more(context),
                            child: Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(shape: BoxShape.circle, color: palette.card),
                              child: Icon(Icons.add_reaction_outlined, color: palette.inkMuted),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 4),
              if (actions.reply) row(Icons.reply_rounded, 'Ответить', MessageCommand.reply),
              if (actions.copy) row(Icons.content_copy_rounded, 'Копировать', MessageCommand.copy),
              if (actions.forward) row(Icons.forward_rounded, 'Переслать', MessageCommand.forward),
              if (actions.edit) row(Icons.edit_outlined, 'Редактировать', MessageCommand.edit),
              if (actions.pin) row(message.isPinned ? Icons.push_pin : Icons.push_pin_outlined, message.isPinned ? 'Открепить' : 'Закрепить', message.isPinned ? MessageCommand.unpin : MessageCommand.pin),
              if (actions.readers) row(Icons.done_all_rounded, 'Кто прочитал', MessageCommand.readers),
              if (actions.select) row(Icons.check_circle_outline_rounded, 'Выбрать', MessageCommand.select),
              if (actions.delete) row(Icons.delete_outline_rounded, 'Удалить', MessageCommand.delete, danger: true),
            ],
          ),
        ),
      ),
    );
  }
}

/// Любой эмодзи для реакции из полного каталога.
Future<String?> showReactionPicker(BuildContext context) {
  return showPrayerSheet<String>(
    context,
    title: 'Реакция',
    builder: (sheet) => EmojiPanel(height: 320, onSelected: (emoji) => Navigator.pop(sheet, emoji)),
  );
}

/// Подтверждение удаления.
Future<bool> confirmDeleteMessage(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialog) => AlertDialog(
      title: const Text('Удалить сообщение?'),
      content: const Text('Оно пропадёт у всех участников чата.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
        TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
      ],
    ),
  );
  return ok == true;
}
