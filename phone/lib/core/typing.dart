import 'dart:async';

import 'package:flutter/foundation.dart';

/// Кто сейчас печатает в каких чатах — по событиям сокета `typing:start` / `typing:stop`.
/// Если «стоп» не пришёл (пропала связь), запись сама гаснет через [ttl].
class TypingStore extends ChangeNotifier {
  TypingStore({this.ttl = const Duration(seconds: 6)});

  final Duration ttl;
  final Map<String, Map<int, _Typist>> _byChat = {};

  bool isTyping(String conversationId) => (_byChat[conversationId]?.isNotEmpty) ?? false;

  /// Имена печатающих в чате.
  List<String> namesIn(String conversationId) => [for (final t in (_byChat[conversationId] ?? const {}).values) t.name];

  /// «печатает…», «Анна печатает…», «Анна и Пётр печатают…», «3 человека печатают…».
  /// В личном чате имя не нужно — и так понятно кто.
  String? label(String conversationId, {required bool group}) {
    final names = namesIn(conversationId);
    if (names.isEmpty) return null;
    if (!group) return 'печатает…';
    final first = [for (final n in names) n.trim().split(' ').first];
    if (first.length == 1) return '${first.first} печатает…';
    if (first.length == 2) return '${first[0]} и ${first[1]} печатают…';
    return '${first.length} человека печатают…';
  }

  void start(String conversationId, int memberId, String name) {
    final chat = _byChat.putIfAbsent(conversationId, () => {});
    final existing = chat[memberId];
    existing?.timer.cancel();
    final isNew = existing == null;
    chat[memberId] = _Typist(name, Timer(ttl, () => stop(conversationId, memberId)));
    if (isNew) notifyListeners();
  }

  void stop(String conversationId, int memberId) {
    final chat = _byChat[conversationId];
    final removed = chat?.remove(memberId);
    if (removed == null) return;
    removed.timer.cancel();
    if (chat!.isEmpty) _byChat.remove(conversationId);
    notifyListeners();
  }

  /// Связь пропала — кто печатает, неизвестно.
  void reset() {
    if (_byChat.isEmpty) return;
    for (final chat in _byChat.values) {
      for (final t in chat.values) {
        t.timer.cancel();
      }
    }
    _byChat.clear();
    notifyListeners();
  }

  /// Разбор сообщения сокета; true — это было событие «печатает».
  bool handle(Map<String, dynamic> message) {
    final type = '${message['type'] ?? ''}';
    if (type != 'typing:start' && type != 'typing:stop') return false;
    final conv = '${message['conversationId'] ?? ''}';
    final member = message['memberId'];
    if (conv.isEmpty || member is! num) return true;
    if (type == 'typing:start') {
      start(conv, member.toInt(), '${message['memberName'] ?? ''}');
    } else {
      stop(conv, member.toInt());
    }
    return true;
  }

  /// Пришло сообщение от того, кто «печатал», — он уже не печатает.
  void messageArrived(String conversationId, int? senderId) {
    if (senderId != null) stop(conversationId, senderId);
  }

  @override
  void dispose() {
    reset();
    super.dispose();
  }
}

class _Typist {
  _Typist(this.name, this.timer);
  final String name;
  final Timer timer;
}
