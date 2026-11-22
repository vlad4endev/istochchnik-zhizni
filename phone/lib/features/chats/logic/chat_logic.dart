import 'package:flutter/painting.dart';
import 'package:intl/intl.dart';

import '../models/chat_models.dart';
import 'attachment_logic.dart';

/// Быстрые реакции — тот же набор, что на сайте.
const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'];

/// Сообщения, склеенные в «пачки» одного автора, с разделителями дат.
class MessageView {
  const MessageView({
    required this.message,
    required this.groupedWithPrev,
    required this.groupedWithNext,
    required this.dateLabel,
  });

  final ChatMessage message;

  /// То же автор и разрыв меньше 5 минут: имя и аватар повторно не рисуем.
  final bool groupedWithPrev;
  final bool groupedWithNext;

  /// «Сегодня», «Вчера» или «13 апреля 2025» — если перед сообщением начинается новый день.
  final String? dateLabel;
}

const _groupGap = Duration(minutes: 5);

String dayLabel(DateTime date, DateTime now) {
  final d = DateTime(date.year, date.month, date.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(d).inDays;
  if (diff == 0) return 'Сегодня';
  if (diff == 1) return 'Вчера';
  return DateFormat('d MMMM yyyy', 'ru').format(date);
}

/// Группировка по времени и автору. [messages] — по возрастанию времени.
List<MessageView> groupMessages(List<ChatMessage> messages, DateTime now) {
  final views = <MessageView>[];
  for (var i = 0; i < messages.length; i++) {
    final m = messages[i];
    final prev = i > 0 ? messages[i - 1] : null;
    final next = i + 1 < messages.length ? messages[i + 1] : null;
    final at = m.createdAt;
    bool sameRun(ChatMessage a, ChatMessage b) =>
        a.senderId == b.senderId &&
        a.createdAt != null &&
        b.createdAt != null &&
        b.createdAt!.difference(a.createdAt!).abs() < _groupGap &&
        a.createdAt!.day == b.createdAt!.day;
    final newDay = at != null && (prev?.createdAt == null || DateTime(prev!.createdAt!.year, prev.createdAt!.month, prev.createdAt!.day) != DateTime(at.year, at.month, at.day));
    views.add(MessageView(
      message: m,
      groupedWithPrev: prev != null && !newDay && sameRun(prev, m),
      groupedWithNext: next != null && sameRun(m, next),
      dateLabel: newDay ? dayLabel(at, now) : null,
    ));
  }
  return views;
}

// ───────────────────────── ссылки ─────────────────────────

final _urlPattern = RegExp(r'https?://[^\s<>"{}|\\^`\[\]]+', caseSensitive: false);
final _trailing = RegExp(r'[.,;:!?)»]+$');

/// Кусок текста: обычный или ссылка.
class TextChunk {
  const TextChunk(this.text, {this.url});
  final String text;

  /// Адрес, если кусок — ссылка (без завершающей пунктуации).
  final String? url;
  bool get isLink => url != null;
}

/// Режет текст на обычные куски и ссылки; точка или скобка в конце предложения в ссылку не входит.
List<TextChunk> chunkText(String text) {
  final chunks = <TextChunk>[];
  var cursor = 0;
  for (final match in _urlPattern.allMatches(text)) {
    var raw = match.group(0)!;
    final trimmed = raw.replaceFirst(_trailing, '');
    if (trimmed.isEmpty) continue;
    raw = trimmed;
    if (match.start > cursor) chunks.add(TextChunk(text.substring(cursor, match.start)));
    chunks.add(TextChunk(raw, url: raw));
    cursor = match.start + raw.length;
  }
  if (cursor < text.length) chunks.add(TextChunk(text.substring(cursor)));
  return chunks;
}

/// Ссылки, для которых показываем карточку: не больше двух, без дублей и без адресов самого приложения.
List<String> previewUrls(String text, {String? ownHost, int max = 2}) {
  final out = <String>[];
  for (final chunk in chunkText(text)) {
    final url = chunk.url;
    if (url == null || out.contains(url)) continue;
    final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
    if (host.isEmpty) continue;
    if (ownHost != null && ownHost.isNotEmpty && host == ownHost.toLowerCase()) continue;
    out.add(url);
    if (out.length >= max) break;
  }
  return out;
}

// ───────────────────────── права на действия ─────────────────────────

bool _isServerId(String id) => RegExp(r'^\d+$').hasMatch(id);

class MessageActions {
  const MessageActions({
    required this.reply,
    required this.edit,
    required this.delete,
    required this.forward,
    required this.copy,
    required this.readers,
    required this.pin,
    required this.react,
    this.select = false,
  });

  final bool reply;
  final bool edit;
  final bool delete;
  final bool forward;
  final bool copy;
  final bool readers;
  final bool pin;
  final bool react;

  /// Начать выделение нескольких сообщений с этого.
  final bool select;

  bool get any => reply || edit || delete || forward || copy || readers || pin || react;
}

/// Что можно сделать с сообщением — по тем же правилам, что на сайте.
MessageActions actionsFor(ChatMessage m, {required int me, required bool groupLike, required bool canPin, bool canReply = true}) {
  final mine = m.senderId == me;
  final server = _isServerId(m.id) && !m.pending;
  final alive = !m.isDeleted && server;
  final plainPayload = m.payloadType != 'access_request';
  return MessageActions(
    reply: alive && canReply,
    edit: alive && mine && m.payloadType != 'poll' && plainPayload,
    delete: alive && plainPayload && (mine || m.senderId == null),
    forward: alive && plainPayload,
    copy: alive && m.isText && m.content.trim().isNotEmpty,
    readers: alive && mine && groupLike,
    pin: alive && canPin,
    react: alive,
    select: alive,
  );
}

// ───────────────────────── реакции ─────────────────────────

/// Моя реакция на месте, не дожидаясь сервера: поставить или снять.
List<Reaction> toggleReaction(List<Reaction> list, String emoji) {
  final index = list.indexWhere((r) => r.emoji == emoji);
  if (index < 0) return [...list, Reaction(emoji: emoji, count: 1, byMe: true)];
  final r = list[index];
  final next = <Reaction>[...list];
  if (r.byMe) {
    if (r.count <= 1) {
      next.removeAt(index);
    } else {
      next[index] = Reaction(emoji: emoji, count: r.count - 1, byMe: false);
    }
  } else {
    next[index] = Reaction(emoji: emoji, count: r.count + 1, byMe: true);
  }
  return next;
}

// ───────────────────────── подписи ─────────────────────────

/// Цвет имени отправителя: один человек — один цвет, как в Telegram.
const _nameColors = [
  Color(0xFFC0392B),
  Color(0xFFD35400),
  Color(0xFF8E7A00),
  Color(0xFF1E8A4C),
  Color(0xFF12756F),
  Color(0xFF1F6FB2),
  Color(0xFF6B5BE0),
  Color(0xFFB23A8A),
];

Color senderColor(int? id) => _nameColors[((id ?? 0).abs()) % _nameColors.length];

/// Статус собеседника: «в сети» или «был(а) …».
String presenceLabel({required bool online, DateTime? lastSeen, required DateTime now}) {
  if (online) return 'в сети';
  if (lastSeen == null) return '';
  final diff = now.difference(lastSeen);
  if (diff.inMinutes < 3) return 'в сети';
  if (diff.inMinutes < 60) return 'был(а) ${diff.inMinutes} мин назад';
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(lastSeen.year, lastSeen.month, lastSeen.day);
  final time = DateFormat('HH:mm').format(lastSeen);
  if (day == today) return 'был(а) сегодня в $time';
  if (day == today.subtract(const Duration(days: 1))) return 'был(а) вчера в $time';
  return 'был(а) ${DateFormat('d MMMM', 'ru').format(lastSeen)}';
}

/// «5 участников» с правильным склонением.
String membersCaption(int n, {bool channel = false}) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  final word = channel
      ? (mod10 == 1 && mod100 != 11 ? 'подписчик' : (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'подписчика' : 'подписчиков'))
      : (mod10 == 1 && mod100 != 11 ? 'участник' : (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'участника' : 'участников'));
  return '$n $word';
}

/// Текст для списка ответов и пересылки: «Фото», «Голосовое» вместо пустой строки.
String messageSummary(ChatMessage m) {
  if (m.isDeleted) return 'Сообщение удалено';
  if (m.content.trim().isNotEmpty && m.payloadType != 'poll') return m.content.trim();
  return switch (m.payloadType) {
    'image' => 'Фото',
    'audio' => 'Голосовое сообщение',
    'video_note' => 'Видео',
    'file' => 'Файл',
    'poll' => 'Опрос: ${m.content.trim()}',
    _ => m.content.trim().isEmpty ? 'Сообщение' : m.content.trim(),
  };
}

// ───────────────────────── общие медиа ─────────────────────────

class SharedFile {
  const SharedFile({required this.messageId, required this.url, required this.name, this.size = 0, this.at});
  final String messageId;
  final String url;
  final String name;

  /// Размер в байтах (0 — неизвестен).
  final int size;
  final DateTime? at;
}

class SharedLink {
  const SharedLink({required this.messageId, required this.url});
  final String messageId;
  final String url;
}

/// Фото, файлы и ссылки диалога — новые сверху. Удалённые сообщения не считаются.
class SharedMedia {
  const SharedMedia({this.images = const [], this.videos = const [], this.files = const [], this.links = const []});
  final List<({String messageId, String url})> images;

  /// Видео (в сообщениях они уходят как «image», отличаются типом содержимого).
  final List<({String messageId, String url})> videos;
  final List<SharedFile> files;
  final List<SharedLink> links;

  bool get isEmpty => images.isEmpty && videos.isEmpty && files.isEmpty && links.isEmpty;

  int get mediaCount => images.length + videos.length;
}

/// Собирает «общие медиа» из сообщений (по возрастанию времени). [resolve] превращает путь в полный адрес.
SharedMedia collectSharedMedia(List<ChatMessage> messages, String Function(String raw) resolve) {
  final images = <({String messageId, String url})>[];
  final videos = <({String messageId, String url})>[];
  final files = <SharedFile>[];
  final links = <SharedLink>[];
  final seenLinks = <String>{};
  for (final m in messages.reversed) {
    if (m.isDeleted) continue;
    final raw = '${m.payload['url'] ?? ''}'.trim();
    final url = raw.isEmpty ? '' : resolve(raw);
    if (m.payloadType == 'image' && url.isNotEmpty) {
      if (isVideoPayload(mimeType: '${m.payload['mimeType'] ?? ''}', url: url, name: '${m.payload['name'] ?? ''}')) {
        videos.add((messageId: m.id, url: url));
      } else {
        images.add((messageId: m.id, url: url));
      }
    } else if (m.payloadType == 'file' && url.isNotEmpty) {
      final name = '${m.payload['name'] ?? ''}'.trim();
      final size = m.payload['size'];
      files.add(SharedFile(messageId: m.id, url: url, name: name.isEmpty ? 'Файл' : name, size: size is num ? size.toInt() : 0, at: m.createdAt));
    }
    if (m.isText) {
      for (final chunk in chunkText(m.content)) {
        final link = chunk.url;
        if (link != null && seenLinks.add(link)) links.add(SharedLink(messageId: m.id, url: link));
      }
    }
  }
  return SharedMedia(images: images, videos: videos, files: files, links: links);
}

/// Дней до ближайшего дня рождения; 0 — сегодня; null — даты нет.
int? daysUntilBirthday(DateTime? birth, DateTime now) {
  if (birth == null) return null;
  final today = DateTime(now.year, now.month, now.day);
  var next = DateTime(now.year, birth.month, birth.day);
  if (next.isBefore(today)) next = DateTime(now.year + 1, birth.month, birth.day);
  return next.difference(today).inDays;
}
