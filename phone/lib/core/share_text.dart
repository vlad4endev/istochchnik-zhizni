import 'package:flutter/services.dart';

/// Системное окно «Поделиться» (Android). Возвращает false, если окно открыть не удалось —
/// вызывающий код тогда копирует текст в буфер.
Future<bool> shareText(String text, {String title = ''}) async {
  try {
    await const MethodChannel('church/system').invokeMethod<void>('shareText', {'text': text, 'title': title});
    return true;
  } catch (_) {
    return false;
  }
}
