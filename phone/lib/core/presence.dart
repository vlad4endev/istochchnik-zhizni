import 'package:flutter/foundation.dart';

import 'dates.dart';

/// Кто сейчас в сети — по событиям сокета (как в веб-версии): список при подключении,
/// затем «вошёл» и «вышел» (с временем последнего визита).
class PresenceStore extends ChangeNotifier {
  final Set<int> _online = {};
  final Map<int, DateTime> _lastSeen = {};

  bool isOnline(int? memberId) => memberId != null && _online.contains(memberId);

  /// Когда участник был в сети в последний раз, если сервер об этом сообщал.
  DateTime? lastSeenOf(int? memberId) => memberId == null ? null : _lastSeen[memberId];

  /// Полный список при подключении сокета.
  void setOnline(Iterable<int> ids) {
    final next = ids.toSet();
    if (setEquals(next, _online)) return;
    _online
      ..clear()
      ..addAll(next);
    notifyListeners();
  }

  void markOnline(int memberId) {
    if (_online.add(memberId)) notifyListeners();
  }

  void markOffline(int memberId, {DateTime? lastSeen}) {
    final changed = _online.remove(memberId);
    final seenChanged = lastSeen != null && _lastSeen[memberId] != lastSeen;
    if (lastSeen != null) _lastSeen[memberId] = lastSeen;
    if (changed || seenChanged) notifyListeners();
  }

  /// Связь с сервером потеряна — кто в сети, неизвестно: лучше не показывать, чем показать неправду.
  void reset() {
    if (_online.isEmpty) return;
    _online.clear();
    notifyListeners();
  }

  /// Разбор сообщения сокета; true — это было событие присутствия.
  bool handle(Map<String, dynamic> message) {
    final type = '${message['type'] ?? ''}';
    switch (type) {
      case 'ready':
        final list = message['onlineMembers'];
        if (list is List) setOnline([for (final v in list) if (v is num) v.toInt()]);
        return true;
      case 'presence:online':
        final id = message['memberId'];
        if (id is num) markOnline(id.toInt());
        return true;
      case 'presence:offline':
        final id = message['memberId'];
        if (id is num) markOffline(id.toInt(), lastSeen: parseApiDate(message['lastSeenAt']));
        return true;
    }
    return false;
  }
}
