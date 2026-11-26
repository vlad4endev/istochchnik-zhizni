import '../../../core/plural.dart';
import '../../chats/data/chat_source.dart';
import '../../chats/widgets/chat_sheets.dart' show ChatPick;

/// Итог отправки приглашения в несколько чатов.
class InviteShareOutcome {
  const InviteShareOutcome({required this.sent, required this.failed});

  /// Названия чатов, куда приглашение ушло.
  final List<String> sent;

  /// Названия чатов, куда не получилось.
  final List<String> failed;

  int get total => sent.length + failed.length;
  bool get allSent => failed.isEmpty && sent.isNotEmpty;
  bool get noneSent => sent.isEmpty;
}

/// Отправляет [text] (название встречи и ссылку) в выбранные чаты от имени пользователя — как обычное сообщение.
/// Чаты обрабатываются по очереди: порядок сообщений предсказуем, а сбой одного чата не мешает остальным.
Future<InviteShareOutcome> sendInviteToChats(ChatSource source, List<ChatPick> picks, String text) async {
  final sent = <String>[];
  final failed = <String>[];
  for (final pick in picks) {
    try {
      await source.send(pick.id, text);
      sent.add(pick.title);
    } catch (_) {
      failed.add(pick.title);
    }
  }
  return InviteShareOutcome(sent: sent, failed: failed);
}

/// Что сказать человеку по итогу отправки.
String describeInviteShare(InviteShareOutcome outcome) {
  if (outcome.total == 0) return 'Чаты не выбраны';
  if (outcome.noneSent) {
    return outcome.total == 1
        ? 'Не удалось отправить приглашение в «${outcome.failed.first}» — проверьте интернет и попробуйте снова.'
        : 'Не удалось отправить приглашение — проверьте интернет и попробуйте снова.';
  }
  if (outcome.allSent) {
    return outcome.sent.length == 1
        ? 'Приглашение отправлено в «${outcome.sent.first}»'
        : 'Приглашение отправлено в ${outcome.sent.length} ${pluralRu(outcome.sent.length, 'чат', 'чата', 'чатов')}';
  }
  final names = outcome.failed.map((n) => '«$n»').join(', ');
  return 'Отправлено в ${outcome.sent.length} из ${outcome.total}. Не получилось: $names — проверьте интернет.';
}
