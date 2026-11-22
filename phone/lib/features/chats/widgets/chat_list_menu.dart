import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/chat_list_menu.dart';

/// Меню по долгому нажатию на чат в списке: закрепить, звук, очистить, удалить — как на сайте.
Future<ChatListCommand?> showChatListMenu(BuildContext context, {required String title, required ChatListMenuModel model}) {
  return showModalBottomSheet<ChatListCommand>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheet) => _ChatListMenu(title: title, model: model),
  );
}

class _ChatListMenu extends StatelessWidget {
  const _ChatListMenu({required this.title, required this.model});
  final String title;
  final ChatListMenuModel model;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final media = MediaQuery.of(context);
    Widget row(Key key, IconData icon, String label, ChatListCommand command, {bool danger = false}) => ListRow(
          key: key,
          leading: Icon(icon, color: danger ? ChurchColors.danger : palette.inkMuted, size: 24),
          title: label,
          titleColor: danger ? ChurchColors.danger : null,
          chevron: false,
          onTap: () => Navigator.pop(context, command),
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
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
                child: Semantics(
                  header: true,
                  child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink)),
                ),
              ),
              row(const ValueKey('chat-menu-pin'), model.pinned ? Icons.push_pin : Icons.push_pin_outlined, model.pinLabel, ChatListCommand.pin),
              row(const ValueKey('chat-menu-mute'), model.muted ? Icons.volume_up_outlined : Icons.volume_off_outlined, model.muteLabel, ChatListCommand.mute),
              row(const ValueKey('chat-menu-clear'), Icons.cleaning_services_outlined, 'Очистить переписку', ChatListCommand.clear),
              row(const ValueKey('chat-menu-delete'), Icons.delete_outline_rounded, model.deleteLabel, ChatListCommand.delete, danger: true),
            ],
          ),
        ),
      ),
    );
  }
}

/// Подтверждение необратимого действия над чатом.
Future<bool> confirmChatAction(BuildContext context, {required String title, required String text, required String action}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialog) => AlertDialog(
      title: Text(title),
      content: Text(text),
      actions: [
        TextButton(key: const ValueKey('chat-confirm-cancel'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
        TextButton(key: const ValueKey('chat-confirm-ok'), onPressed: () => Navigator.pop(dialog, true), child: Text(action)),
      ],
    ),
  );
  return ok == true;
}
