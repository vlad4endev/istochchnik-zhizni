import 'dart:async';

import 'package:flutter/foundation.dart';

import 'data/chat_source.dart';
import 'logic/attachment_logic.dart';
import 'logic/chat_logic.dart';
import 'models/chat_models.dart';

/// Идёт отправка вложений: какой файл по счёту и сколько загружено.
class UploadProgress {
  const UploadProgress({required this.index, required this.total, required this.name, this.fraction = 0});
  final int index;
  final int total;
  final String name;
  final double fraction;

  UploadProgress copyWith({double? fraction}) => UploadProgress(index: index, total: total, name: name, fraction: fraction ?? this.fraction);
}

/// Состояние открытого чата: сообщения, ответ и правка, реакции, участники и права.
class ThreadController extends ChangeNotifier {
  ThreadController(this.source, {required this.conversationId, required this.meId, this.pageSize = 50});

  final ChatSource source;
  final String conversationId;
  final int meId;
  final int pageSize;

  /// По возрастанию времени.
  List<ChatMessage> messages = const [];
  ChatMeta? meta;
  Map<int, ChatMember> members = const {};

  bool loading = true;
  String? error;
  bool sending = false;
  bool loadingOlder = false;

  /// Идёт загрузка вложений (null — не идёт).
  UploadProgress? uploading;
  bool hasMore = false;

  /// Ответ на это сообщение уйдёт вместе со следующим текстом.
  ChatMessage? replyTo;

  /// Правка этого сообщения: поле ввода работает как редактор.
  ChatMessage? editing;

  final Map<String, Future<LinkPreview?>> _previews = {};
  StreamSubscription<Map<String, dynamic>>? _events;
  Timer? _debounce;
  bool _disposed = false;

  bool get isGroupLike => meta?.isGroupLike ?? false;
  bool get canSend => meta?.canSend ?? true;
  bool get canSendMedia => meta?.canSendMedia ?? true;
  bool get canPin => meta?.canPin ?? false;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// Подписка на события сокета: любое событие этого чата → тихое обновление.
  void listen(Stream<Map<String, dynamic>> events) {
    _events?.cancel();
    _events = events.listen((e) {
      final id = '${e['conversationId'] ?? ''}';
      if (id.isNotEmpty && id != conversationId) return;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 350), refresh);
    });
  }

  Future<void> load() async {
    final first = messages.isEmpty;
    loading = first;
    error = null;
    _notify();
    final results = await Future.wait<Object?>([
      _try(() => source.messages(conversationId, limit: pageSize)),
      _try(() => source.meta(conversationId)),
    ]);
    if (_disposed) return;
    final loaded = results[0] as List<ChatMessage>?;
    if (loaded != null) {
      messages = loaded;
      hasMore = loaded.length >= pageSize;
    } else if (first) {
      error = 'Не удалось загрузить сообщения. Проверьте интернет и попробуйте снова.';
    }
    final m = results[1] as ChatMeta?;
    if (m != null) meta = m;
    loading = false;
    _notify();
    if (isGroupLike && members.isEmpty) unawaited(_loadMembers());
  }

  Future<void> _loadMembers() async {
    final list = await _try(() => source.members(conversationId));
    if (list == null || _disposed) return;
    members = {for (final m in list) m.id: m};
    _notify();
  }

  /// Тихое обновление последних сообщений: без спиннера, прежнее остаётся при сбое.
  Future<void> refresh() async {
    final loaded = await _try(() => source.messages(conversationId, limit: pageSize));
    if (loaded == null || _disposed) return;
    // Подгруженная ранее история остаётся, свежая часть заменяется целиком.
    final firstFresh = loaded.isEmpty ? null : loaded.first.id;
    final older = firstFresh == null
        ? const <ChatMessage>[]
        : messages.takeWhile((m) => m.id != firstFresh).where((m) => _numeric(m.id) < _numeric(firstFresh)).toList();
    final pendingLocal = messages.where((m) => m.pending).toList();
    messages = [...older, ...loaded, ...pendingLocal];
    _notify();
  }

  static int _numeric(String id) => int.tryParse(id) ?? 0;

  Future<void> loadOlder() async {
    if (loadingOlder || !hasMore || messages.isEmpty) return;
    loadingOlder = true;
    _notify();
    try {
      final firstReal = messages.firstWhere((m) => !m.pending, orElse: () => messages.first);
      final page = await source.messages(conversationId, before: firstReal.id, limit: pageSize);
      if (_disposed) return;
      final known = {for (final m in messages) m.id};
      messages = [...page.where((m) => !known.contains(m.id)), ...messages];
      hasMore = page.length >= pageSize;
    } catch (_) {
      // Следующий скролл повторит попытку.
    } finally {
      loadingOlder = false;
      _notify();
    }
  }

  Future<T?> _try<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (_) {
      return null;
    }
  }

  // ───────────── отправка, ответ, правка ─────────────

  void startReply(ChatMessage message) {
    editing = null;
    replyTo = message;
    _notify();
  }

  void startEdit(ChatMessage message) {
    replyTo = null;
    editing = message;
    _notify();
  }

  void cancelComposerMode() {
    replyTo = null;
    editing = null;
    _notify();
  }

  /// Отправить текст: новое сообщение (с ответом, если выбран) или правка. Ошибку получает вызывающий.
  Future<void> submit(String text) async {
    final body = text.trim();
    if (body.isEmpty || sending) return;
    sending = true;
    _notify();
    try {
      final edit = editing;
      if (edit != null) {
        await source.edit(edit.id, body);
        messages = [for (final m in messages) m.id == edit.id ? m.copyWith(content: body, isEdited: true) : m];
        editing = null;
      } else {
        final reply = replyTo;
        final sent = await source.send(conversationId, body, replyTo: reply?.id);
        replyTo = null;
        _append(sent);
      }
    } finally {
      sending = false;
      _notify();
    }
  }

  /// Отправить вложение, уже загруженное на сервер, или голосовое.
  Future<void> sendPayload({required String payloadType, required Map<String, dynamic> payload, String caption = ''}) async {
    sending = true;
    _notify();
    try {
      final sent = await source.send(conversationId, caption, payloadType: payloadType, payload: payload, replyTo: replyTo?.id);
      replyTo = null;
      _append(sent);
    } finally {
      sending = false;
      _notify();
    }
  }

  /// Загрузить и отправить вложения по очереди. Сбой одного файла не мешает остальным.
  /// Возвращает тексты ошибок по файлам, которые не ушли (пусто — всё отправлено).
  Future<List<String>> sendAttachments(List<PickedAttachment> items, {bool voice = false}) async {
    if (items.isEmpty || uploading != null) return const [];
    final failures = <String>[];
    sending = true;
    try {
      for (var i = 0; i < items.length; i++) {
        final item = items[i];
        uploading = UploadProgress(index: i + 1, total: items.length, name: item.name);
        _notify();
        try {
          final uploaded = await source.upload(
            path: item.path,
            name: item.name,
            conversationId: conversationId,
            onProgress: (fraction) {
              uploading = uploading?.copyWith(fraction: fraction);
              _notify();
            },
          );
          final mime = '${uploaded['mimeType'] ?? ''}'.isNotEmpty ? '${uploaded['mimeType']}' : item.mimeType;
          final type = voice ? 'audio' : payloadTypeFor(item.name, mime);
          final reply = replyTo?.id;
          final sent = await source.send(conversationId, '', replyTo: reply, payloadType: type, payload: {
            'url': '${uploaded['url'] ?? ''}',
            'name': '${uploaded['name'] ?? ''}'.isEmpty ? item.name : '${uploaded['name']}',
            'objectPath': '${uploaded['objectPath'] ?? ''}',
            'mimeType': mime ?? '',
            'size': uploaded['size'] is num ? (uploaded['size'] as num).toInt() : 0,
            if (voice) 'kind': 'voice',
          });
          replyTo = null;
          _append(sent);
        } catch (e) {
          failures.add(attachmentError(item.name, e is ChatException ? e.message : 'проверьте интернет и попробуйте снова'));
        }
      }
    } finally {
      uploading = null;
      sending = false;
      _notify();
    }
    return failures;
  }

  void _append(ChatMessage? sent) {
    if (sent == null) {
      unawaited(refresh());
      return;
    }
    if (messages.any((m) => m.id == sent.id)) return;
    messages = [...messages, sent];
  }

  // ───────────── реакции, удаление, голосование ─────────────

  /// Поставить или снять реакцию: на экране сразу, при сбое — откат.
  Future<void> react(ChatMessage message, String emoji) async {
    final before = messages;
    final mine = message.reactions.any((r) => r.emoji == emoji && r.byMe);
    _replace(message.id, (m) => m.copyWith(reactions: toggleReaction(m.reactions, emoji)));
    try {
      await source.react(message.id, emoji, add: !mine);
    } catch (_) {
      messages = before;
      _notify();
      rethrow;
    }
  }

  Future<void> remove(ChatMessage message) async {
    final before = messages;
    _replace(message.id, (m) => m.copyWith(isDeleted: true));
    try {
      await source.delete(message.id);
    } catch (_) {
      messages = before;
      _notify();
      rethrow;
    }
  }

  Future<void> vote(ChatMessage message, int option) async {
    await source.vote(message.id, [option]);
    await refresh();
  }

  Future<void> pin(ChatMessage message, bool pinned) async {
    await source.pin(conversationId, message.id, pinned: pinned);
    _replace(message.id, (m) => m.copyWith(isPinned: pinned));
  }

  void _replace(String id, ChatMessage Function(ChatMessage) change) {
    messages = [for (final m in messages) m.id == id ? change(m) : m];
    _notify();
  }

  /// Карточка ссылки; один адрес запрашивается один раз.
  Future<LinkPreview?> previewOf(String url) => _previews.putIfAbsent(url, () => _try<LinkPreview?>(() => source.linkPreview(url)));

  ChatMember? memberOf(int? id) => id == null ? null : members[id];

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    _events?.cancel();
    super.dispose();
  }
}
