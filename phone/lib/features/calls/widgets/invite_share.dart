import 'package:material_ui/material_ui.dart';

import '../../../ui/widgets.dart' show showMessage;
import '../../chats/data/chat_source.dart';
import '../../chats/widgets/chat_sheets.dart';
import '../logic/invite_send.dart';

/// «Поделиться» приглашением: человек выбирает чаты, и приглашение (название и ссылка) уходит туда
/// автоматически от его имени. Возвращает итог; null — закрыли выбор, ничего не отправив.
Future<InviteShareOutcome?> shareInviteToChats(BuildContext context, {required ChatSource source, required String text}) async {
  final picks = await showChatPickerSheet(context, source, title: 'Отправить приглашение', actionLabel: 'Отправить');
  if (picks == null || picks.isEmpty || !context.mounted) return null;
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(const SnackBar(content: Text('Отправляем приглашение…'), duration: Duration(seconds: 30)));
  final outcome = await sendInviteToChats(source, picks, text);
  if (context.mounted) {
    ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
    showMessage(context, describeInviteShare(outcome));
  }
  return outcome;
}
