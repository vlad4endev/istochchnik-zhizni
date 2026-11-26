import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Звонок, в котором человек сейчас находится. Запоминается, пока он в комнате: если телефон
/// выгрузит приложение (например, пока отправляете ссылку-приглашение в мессенджер),
/// после запуска приложение вернёт человека в этот звонок.
class ActiveCallRecord {
  const ActiveCallRecord({
    required this.callId,
    required this.host,
    required this.video,
    required this.title,
    required this.at,
    this.conversationId,
  });

  final String callId;

  /// Организатор встречи (создал её): ему показываем ссылку и «Завершить для всех».
  final bool host;
  final bool video;
  final String title;
  final String? conversationId;
  final DateTime at;
}

class ActiveCallStore {
  const ActiveCallStore._();

  static const _key = 'active_call';

  /// Сервер убирает «пропавшего» участника примерно через 4 минуты, но встреча с другими живёт дольше:
  /// запись считается актуальной полчаса, дальше возвращать человека незачем.
  static const maxAge = Duration(minutes: 30);

  static Future<void> save({
    required String callId,
    required bool host,
    required bool video,
    required String title,
    String? conversationId,
    DateTime? now,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _key,
        jsonEncode({
          'id': callId,
          'host': host,
          'video': video,
          'title': title,
          'conv': conversationId,
          'at': (now ?? DateTime.now()).toIso8601String(),
        }),
      );
    } catch (_) {}
  }

  static Future<void> clear() async {
    try {
      await (await SharedPreferences.getInstance()).remove(_key);
    } catch (_) {}
  }

  static Future<ActiveCallRecord?> read({DateTime? now}) async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final id = '${data['id'] ?? ''}';
      final at = DateTime.tryParse('${data['at']}');
      if (id.isEmpty || at == null) return null;
      if ((now ?? DateTime.now()).difference(at) > maxAge) {
        await clear();
        return null;
      }
      final conv = '${data['conv'] ?? ''}';
      return ActiveCallRecord(
        callId: id,
        host: data['host'] == true,
        video: data['video'] == true,
        title: '${data['title'] ?? ''}',
        conversationId: conv.isEmpty ? null : conv,
        at: at,
      );
    } catch (_) {
      return null;
    }
  }
}
