import '../../../core/session.dart';

/// Максимальная длина названия встречи (как в вебе).
const int meetingTitleMax = 80;

enum MeetingMedia { video, audio }

extension MeetingMediaX on MeetingMedia {
  bool get isVideo => this == MeetingMedia.video;
  String get apiValue => isVideo ? 'video' : 'audio';
  String get defaultTitle => isVideo ? 'Видеовстреча' : 'Аудиовстреча';
}

/// Шаблон названия молитвенной стражи.
class MeetingTemplate {
  const MeetingTemplate({required this.id, required this.title, required this.short, required this.hint});

  final String id;
  final String title;
  final String short;
  final String hint;
}

const List<MeetingTemplate> prayerWatchTemplates = [
  MeetingTemplate(id: 'morning', title: 'Утренняя молитвенная стража', short: 'Утро', hint: 'Для утреннего созвона'),
  MeetingTemplate(id: 'evening', title: 'Вечерняя молитвенная стража', short: 'Вечер', hint: 'Для вечернего созвона'),
];

/// Шаблоны доступны пастору, администратору и координатору сбора молитвенных нужд.
bool canUseMeetingTemplates(AppUser? user) {
  if (user == null) return false;
  return user.isPastor || user.isAdmin || user.isCollectionCoordinator;
}

/// Название для сервера: обрезаем пробелы и длину; пустое → null (сервер подставит своё).
String? cleanMeetingTitle(String? raw) {
  final text = (raw ?? '').trim();
  if (text.isEmpty) return null;
  return text.length > meetingTitleMax ? text.substring(0, meetingTitleMax) : text;
}

/// Текст для буфера и «Поделиться»: название и ссылка с новой строки.
String inviteShareText(String title, String url, {required MeetingMedia media}) {
  final name = title.trim().isEmpty ? media.defaultTitle : title.trim();
  final link = url.trim();
  return link.isEmpty ? name : '$name\n$link';
}

/// Ссылка с сервера может быть относительной (`/call/join/…`), если не задан публичный origin.
String absoluteInviteUrl(String raw, String apiOrigin) {
  final value = raw.trim();
  if (value.isEmpty) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  final origin = apiOrigin.endsWith('/') ? apiOrigin.substring(0, apiOrigin.length - 1) : apiOrigin;
  return value.startsWith('/') ? '$origin$value' : '$origin/$value';
}

/// Параметры создания конференции по ссылке.
class MeetingLaunch {
  const MeetingLaunch({
    required this.media,
    this.conversationId,
    this.title,
    this.micOn = true,
    this.camOn = true,
  });

  final MeetingMedia media;

  /// null — отдельная встреча без чата (как «Телемост» в вебе).
  final String? conversationId;
  final String? title;
  final bool micOn;
  final bool camOn;

  bool get standalone => conversationId == null || conversationId!.isEmpty;
}
