import '../../../core/json.dart';

enum ChatListCommand { pin, mute, clear, delete }

/// Что показать в меню строки списка чатов — те же правила и тексты, что в веб-версии.
class ChatListMenuModel {
  const ChatListMenuModel({
    required this.pinned,
    required this.muted,
    required this.ownerDeletes,
    required this.deleteLabel,
    required this.deleteConfirmTitle,
    required this.deleteConfirmText,
    required this.deleteConfirmAction,
  });

  final bool pinned;
  final bool muted;

  /// Создатель группы или канала удаляет их у всех, а не просто выходит.
  final bool ownerDeletes;
  final String deleteLabel;
  final String deleteConfirmTitle;
  final String deleteConfirmText;
  final String deleteConfirmAction;

  String get pinLabel => pinned ? 'Открепить' : 'Закрепить';
  String get muteLabel => muted ? 'Включить звук' : 'Убрать звук';

  static const clearConfirmTitle = 'Очистить переписку?';
  static const clearConfirmText = 'Все сообщения в этом чате исчезнут у всех участников. Действие необратимо.';

  factory ChatListMenuModel.from(Map<String, dynamic> item) {
    final type = str(item['type']);
    final group = type == 'group' || type == 'channel';
    final ownerDeletes = group && str(item['my_role']) == 'owner';
    final noun = type == 'channel' ? 'канал' : 'группу';
    return ChatListMenuModel(
      pinned: asBool(item['my_ui_pinned']),
      muted: asBool(item['my_muted']),
      ownerDeletes: ownerDeletes,
      deleteLabel: ownerDeletes ? 'Удалить $noun' : 'Удалить чат',
      deleteConfirmTitle: ownerDeletes ? 'Удалить $noun?' : 'Удалить чат?',
      deleteConfirmText: ownerDeletes
          ? 'Переписка будет стёрта, а чат пропадёт у всех участников.'
          : 'Чат исчезнет из вашего списка, и вы выйдете из беседы.${group ? ' Вернуться в группу можно будет только по приглашению.' : ''}',
      deleteConfirmAction: 'Удалить',
    );
  }
}

/// Применить к строке списка то, что уже подтвердил сервер, чтобы экран обновился сразу.
Map<String, dynamic> applyChatPreference(Map<String, dynamic> item, {bool? pinned, bool? muted}) => {
      ...item,
      'my_ui_pinned': ?pinned,
      'my_muted': ?muted,
    };
