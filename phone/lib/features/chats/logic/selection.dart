import '../models/chat_models.dart';
import 'chat_logic.dart';
import 'mentions.dart';

/// Выбранные сообщения в порядке переписки (по возрастанию времени).
List<ChatMessage> orderedSelection(List<ChatMessage> all, Set<String> ids) => [for (final m in all) if (ids.contains(m.id)) m];

/// Какие действия доступны сразу для всех выбранных — как в Telegram: удалить можно, только если
/// можно удалить каждое, переслать — если можно переслать каждое.
class SelectionActions {
  const SelectionActions({required this.copy, required this.forward, required this.delete});
  final bool copy;
  final bool forward;
  final bool delete;
}

SelectionActions selectionActions(List<ChatMessage> selected, {required int me, required bool groupLike, required bool canPin}) {
  if (selected.isEmpty) return const SelectionActions(copy: false, forward: false, delete: false);
  final each = [for (final m in selected) actionsFor(m, me: me, groupLike: groupLike, canPin: canPin)];
  return SelectionActions(
    copy: selected.any((m) => m.isText && m.content.trim().isNotEmpty && !m.isDeleted),
    forward: each.every((a) => a.forward),
    delete: each.every((a) => a.delete),
  );
}

/// Текст для буфера обмена: строки сообщений; в группах с именем автора, если выбрано несколько.
String selectionText(List<ChatMessage> selected, {required bool withAuthors, Map<int, String> names = const {}}) {
  final lines = <String>[];
  for (final m in selected) {
    if (!m.isText || m.isDeleted || m.content.trim().isEmpty) continue;
    final author = withAuthors && selected.length > 1 && m.senderName.isNotEmpty ? '${m.senderName}: ' : '';
    lines.add('$author${mentionsAsText(m.content.trim(), names)}');
  }
  return lines.join('\n');
}

/// «1 сообщение», «3 сообщения», «5 сообщений».
String messagesCount(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  if (mod10 == 1 && mod100 != 11) return '$n сообщение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return '$n сообщения';
  return '$n сообщений';
}
