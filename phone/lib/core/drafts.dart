import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Черновики: недописанное сообщение сохраняется у каждого чата и возвращается при открытии,
/// а в списке чатов показывается «Черновик: …» — как в Telegram. Хранятся только на телефоне.
class DraftStore extends ChangeNotifier {
  DraftStore();

  /// Общий на приложение.
  static final DraftStore instance = DraftStore();

  static const _prefix = 'drafts_v1:';
  final Map<String, String> _drafts = {};
  int? _userId;
  Timer? _flush;

  String textFor(String conversationId) => _drafts[conversationId] ?? '';

  bool has(String conversationId) => textFor(conversationId).trim().isNotEmpty;

  /// Подгрузить черновики аккаунта (при входе и смене аккаунта).
  Future<void> load(int userId) async {
    if (_userId == userId) return;
    _userId = userId;
    _drafts.clear();
    try {
      final raw = (await SharedPreferences.getInstance()).getString('$_prefix$userId');
      if (raw != null && raw.isNotEmpty) {
        final data = jsonDecode(raw);
        if (data is Map) {
          for (final e in data.entries) {
            if (e.value is String && '${e.value}'.trim().isNotEmpty) _drafts['${e.key}'] = e.value as String;
          }
        }
      }
    } catch (_) {}
    notifyListeners();
  }

  void set(String conversationId, String text) {
    final clean = text.trim().isEmpty ? '' : text;
    if (textFor(conversationId) == clean) return;
    if (clean.isEmpty) {
      _drafts.remove(conversationId);
    } else {
      _drafts[conversationId] = clean;
    }
    notifyListeners();
    _scheduleSave();
  }

  void clear(String conversationId) => set(conversationId, '');

  /// При выходе из аккаунта черновики на телефоне стираем.
  Future<void> forget() async {
    final user = _userId;
    _drafts.clear();
    _userId = null;
    notifyListeners();
    if (user == null) return;
    try {
      await (await SharedPreferences.getInstance()).remove('$_prefix$user');
    } catch (_) {}
  }

  void _scheduleSave() {
    if (_userId == null) return; // аккаунт ещё не известен — сохранять некуда
    _flush?.cancel();
    _flush = Timer(const Duration(milliseconds: 500), save);
  }

  Future<void> save() async {
    _flush?.cancel();
    final user = _userId;
    if (user == null) return;
    try {
      await (await SharedPreferences.getInstance()).setString('$_prefix$user', jsonEncode(_drafts));
    } catch (_) {}
  }
}
