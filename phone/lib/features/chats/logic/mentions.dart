import '../models/chat_models.dart';

/// Упоминания в группах — как в веб-версии. В поле ввода видно «@Имя», а идентификатор участника
/// спрятан невидимыми знаками U+2060 вокруг числа. На сервер уходит компактное `@[id]`,
/// имя подставляется при показе сообщения.
const mentionIdWrap = '⁠';

final _visualMention = RegExp('@([^$mentionIdWrap\\n]+?)$mentionIdWrap(\\d+)$mentionIdWrap');
final _canonicalMention = RegExp(r'@\[(\d+)\]');

String _safeLabel(String label, int id) {
  final safe = label.replaceAll(mentionIdWrap, '').replaceAll(']', '').replaceAll(RegExp(r'\s+'), ' ').trim();
  return safe.isEmpty ? 'участник $id' : safe;
}

/// Метка для вставки из списка подсказок: в поле видно только «@Имя».
String buildMentionToken(String label, int id) => '@${_safeLabel(label, id)}$mentionIdWrap$id$mentionIdWrap';

/// Перед отправкой: «@Имя⁠id⁠» → `@[id]`.
String normalizeMentions(String content) => content.replaceAllMapped(_visualMention, (m) => '@[${m.group(2)}]');

/// При правке сообщения: `@[id]` → «@Имя» с невидимым id (если имя известно).
String denormalizeMentions(String text, Map<int, String> namesById) => text.replaceAllMapped(_canonicalMention, (m) {
      final id = int.tryParse(m.group(1)!) ?? 0;
      final name = namesById[id];
      if (id <= 0 || name == null || name.trim().isEmpty) return m.group(0)!;
      return buildMentionToken(name, id);
    });

/// Тот же текст без невидимых знаков (для копирования и подсказок).
String stripMentionMarkers(String text) => text.replaceAll(RegExp('$mentionIdWrap\\d+$mentionIdWrap'), '');

/// Часть текста сообщения: обычная или упоминание.
class MentionSegment {
  const MentionSegment.text(this.text) : memberId = null;
  const MentionSegment.mention(this.text, int this.memberId);
  final String text;
  final int? memberId;
  bool get isMention => memberId != null;
}

/// Разбор текста сообщения на части; `@[id]` → «@Имя» (или «@участник», если имя неизвестно).
List<MentionSegment> splitMentions(String content, Map<int, String> namesById) {
  final out = <MentionSegment>[];
  var from = 0;
  for (final m in _canonicalMention.allMatches(content)) {
    if (m.start > from) out.add(MentionSegment.text(content.substring(from, m.start)));
    final id = int.parse(m.group(1)!);
    final name = namesById[id]?.trim() ?? '';
    out.add(MentionSegment.mention('@${name.isEmpty ? 'участник' : name}', id));
    from = m.end;
  }
  if (from < content.length) out.add(MentionSegment.text(content.substring(from)));
  return out;
}

/// Текст сообщения для буфера обмена: `@[id]` → «@Имя».
String mentionsAsText(String content, Map<int, String> namesById) => splitMentions(content, namesById).map((s) => s.text).join();

/// В превью списка чатов `@[id]` нечитаемо — заменяем на «@участник».
String mentionsForPreview(String text) => text.replaceAll(_canonicalMention, '@участник');

/// Набираемое сейчас упоминание: где начинается «@» и что набрано после него.
class MentionQuery {
  const MentionQuery(this.start, this.query);
  final int start;
  final String query;
}

/// Если курсор стоит в слове после «@» (в начале строки или после пробела) — что искать в подсказках.
MentionQuery? activeMentionQuery(String text, int cursor) {
  if (cursor < 0 || cursor > text.length) return null;
  final before = text.substring(0, cursor);
  final at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !RegExp(r'\s').hasMatch(before[at - 1])) return null;
  final fragment = before.substring(at + 1);
  if (fragment.contains('\n')) return null;
  // Уже вставлен готовый токен — подсказка не нужна.
  if (fragment.contains(mentionIdWrap)) return null;
  // Имя из нескольких слов: дальше двух слов не ищем.
  if (RegExp(r'\s').allMatches(fragment).length > 1) return null;
  return MentionQuery(at, fragment);
}

/// Кого предложить: по началу имени или фамилии, без меня; найденные с начала имени — первыми.
List<ChatMember> mentionCandidates(Iterable<ChatMember> members, String query, {required int me, int limit = 6}) {
  final q = query.trim().toLowerCase();
  final pool = [for (final m in members) if (m.id != me && m.name.trim().isNotEmpty) m];
  bool starts(ChatMember m) => m.name.toLowerCase().startsWith(q);
  bool anyWord(ChatMember m) => m.name.toLowerCase().split(RegExp(r'\s+')).any((w) => w.startsWith(q));
  final matched = q.isEmpty ? pool : pool.where(anyWord).toList();
  matched.sort((a, b) {
    final sa = starts(a) ? 0 : 1;
    final sb = starts(b) ? 0 : 1;
    return sa != sb ? sa - sb : a.name.compareTo(b.name);
  });
  return matched.take(limit).toList();
}

/// Вставляет токен вместо набранного «@запрос»; курсор — после токена и пробела.
({String text, int cursor}) insertMention(String text, MentionQuery query, int cursor, ChatMember member) {
  final token = '${buildMentionToken(member.name, member.id)} ';
  final next = text.replaceRange(query.start, cursor, token);
  return (text: next, cursor: query.start + token.length);
}
