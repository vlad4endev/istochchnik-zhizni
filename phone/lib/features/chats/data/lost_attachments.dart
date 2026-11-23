import 'dart:convert';

import 'package:android_file_picker/android_file_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/widgets.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../logic/attachment_logic.dart';

/// Чат, из которого человек открыл окно выбора файла. Запоминается до возврата из окна.
class PendingAttach {
  const PendingAttach({required this.conversationId, required this.title, required this.at});
  final String conversationId;
  final String title;
  final DateTime at;
}

/// Пока открыто системное окно выбора, телефон (например, Xiaomi) может выгрузить приложение из памяти.
/// Тогда при возврате приложение стартует заново на «Главной», а выбранный файл теряется.
/// Мы заранее запоминаем чат ([mark]) и при запуске находим, что человек успел выбрать ([LostPickSource]).
class AttachRecovery {
  const AttachRecovery._();

  static const _key = 'pending_attach';

  /// Дольше этого срока запись считается забытой: человек давно ушёл, возвращать его в чат не нужно.
  static const maxAge = Duration(minutes: 15);

  static Future<void> mark(String conversationId, String title) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode({'id': conversationId, 'title': title, 'at': DateTime.now().toIso8601String()}));
    } catch (_) {}
  }

  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }

  static Future<PendingAttach?> read({DateTime? now}) async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final at = DateTime.tryParse('${data['at']}');
      final id = '${data['id'] ?? ''}';
      if (at == null || id.isEmpty) return null;
      if ((now ?? DateTime.now()).difference(at) > maxAge) return null;
      return PendingAttach(conversationId: id, title: '${data['title'] ?? ''}', at: at);
    } catch (_) {
      return null;
    }
  }
}

/// Откуда достать выбор, потерянный вместе с выгруженным приложением.
abstract class LostPickSource {
  Future<List<PickedAttachment>> recover();
}

class DeviceLostPickSource implements LostPickSource {
  @override
  Future<List<PickedAttachment>> recover() async {
    final found = <PickedAttachment>[];
    try {
      if (FilePickerPlatform.instance case final FilePickerAndroid android) {
        final lost = await android.retrieveLostData();
        if (lost != null && lost.exception == null) {
          for (final f in lost.files) {
            final path = f.path;
            if (path != null) found.add(PickedAttachment(path: path, name: f.name));
          }
        }
      }
    } catch (_) {}
    try {
      final lost = await ImagePicker().retrieveLostData();
      if (!lost.isEmpty && lost.exception == null) {
        for (final f in lost.files ?? const <XFile>[]) {
          found.add(PickedAttachment(path: f.path, name: f.name, mimeType: f.mimeType));
        }
      }
    } catch (_) {}
    return found;
  }
}

/// Если приложение было выгружено во время выбора файла — сразу открывает тот же чат; выбранное догоняет следом.
/// [open] получает чат и будущий список файлов: достать и скопировать файл может занять время, а чат ждать не должен.
/// Файлов может не оказаться (окно закрыли без выбора). Возвращает true, когда чат был открыт.
Future<bool> reopenAfterPickerKill({
  required Future<void> Function(PendingAttach chat, Future<List<PickedAttachment>> files) open,
  LostPickSource? source,
  DateTime? now,
}) async {
  final pending = await AttachRecovery.read(now: now);
  if (pending == null) return false;
  await AttachRecovery.clear();
  final files = (source ?? DeviceLostPickSource()).recover().catchError((Object _) => <PickedAttachment>[]);
  await open(pending, files);
  return true;
}

@visibleForTesting
String debugPendingKey() => AttachRecovery._key;
