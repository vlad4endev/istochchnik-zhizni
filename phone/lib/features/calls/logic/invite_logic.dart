import 'meeting_logic.dart';

final RegExp _joinPath = RegExp(r'/call/join/([A-Za-z0-9_\-%.]+)');
final RegExp _bareToken = RegExp(r'^[A-Za-z0-9_\-]{32,64}$');

/// Достаёт токен приглашения из ссылки (`…/call/join/<токен>`), из текста
/// «название + ссылка», который рассылает приложение, или из самого токена.
String? parseInviteToken(String? raw) {
  final text = (raw ?? '').trim();
  if (text.isEmpty) return null;
  final match = _joinPath.firstMatch(text);
  if (match != null) {
    final token = Uri.decodeComponent(match.group(1)!).replaceAll(RegExp(r'[.]+$'), '');
    return token.isEmpty ? null : token;
  }
  return _bareToken.hasMatch(text) ? text : null;
}

/// Только ссылка на встречу (не голый токен) — для нажатия на ссылку в сообщении.
String? inviteTokenFromUrl(String? url) {
  final text = (url ?? '').trim();
  if (!_joinPath.hasMatch(text)) return null;
  return parseInviteToken(text);
}

/// Ответ `GET /api/call-invitations/:token`.
class InvitePreview {
  const InvitePreview({
    required this.valid,
    required this.canJoin,
    required this.media,
    this.reason,
    this.title,
    this.participants,
  });

  final bool valid;
  final bool canJoin;
  final MeetingMedia media;
  final String? reason;
  final String? title;
  final int? participants;

  factory InvitePreview.fromJson(Map<String, dynamic> json) {
    final title = (json['title'] ?? json['conversationTitle'])?.toString().trim();
    final count = json['participantCount'];
    return InvitePreview(
      valid: json['valid'] == true,
      canJoin: json['canJoin'] == true,
      media: json['mediaType'] == 'audio' ? MeetingMedia.audio : MeetingMedia.video,
      reason: json['reason']?.toString(),
      title: title == null || title.isEmpty ? null : title,
      participants: count is num ? count.toInt() : null,
    );
  }

  String get displayTitle => title ?? media.defaultTitle;

  /// Почему войти нельзя (null — можно).
  String? get blockReason {
    if (valid && canJoin) return null;
    return switch (reason) {
      'expired' => 'Срок приглашения истёк',
      'revoked' => 'Приглашение отозвано',
      'call_ended' => 'Встреча уже завершена',
      'no_group_access' => 'Нет доступа к этой встрече',
      'exhausted' => 'Лимит использований приглашения исчерпан',
      _ => 'Приглашение недействительно',
    };
  }
}
