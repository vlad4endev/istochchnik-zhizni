import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';

import 'firebase_config.dart';

/// Что мешает уведомлениям и звонкам: системные разрешения и связь устройства с сервером.
/// Показывается в профиле, чтобы человек видел причину и мог исправить сам.
class PushStatus extends ChangeNotifier {
  PushStatus._() : supported = pushSupported;

  @visibleForTesting
  PushStatus.test({this.supported = true});

  static final PushStatus instance = PushStatus._();

  static const _channel = MethodChannel('church/system');
  static const systemChannel = _channel;

  /// null — ещё не узнали (или платформа не Android).
  bool? notificationsAllowed;
  bool? fullScreenAllowed;
  bool tokenRegistered = false;

  /// Почему не удалось получить токен Firebase (без Google Play Services, ключ не принят и т. п.).
  String? firebaseProblem;

  final bool supported;

  /// Всё в порядке или ещё неизвестно.
  bool get allGood =>
      notificationsAllowed != false && fullScreenAllowed != false && tokenRegistered && firebaseProblem == null;

  Future<void> refresh() async {
    if (!supported) return;
    try {
      notificationsAllowed = await _channel.invokeMethod<bool>('notificationsEnabled');
    } catch (_) {
      notificationsAllowed = null;
    }
    try {
      fullScreenAllowed = await FlutterCallkitIncoming.canUseFullScreenIntent();
    } catch (_) {
      fullScreenAllowed = null;
    }
    notifyListeners();
  }

  void setToken({required bool registered}) {
    if (tokenRegistered == registered) return;
    tokenRegistered = registered;
    notifyListeners();
  }

  void setFirebaseProblem(String? problem) {
    if (firebaseProblem == problem) return;
    firebaseProblem = problem;
    notifyListeners();
  }

  Future<void> openNotificationSettings() async {
    try {
      await _channel.invokeMethod<void>('openNotificationSettings');
    } catch (_) {}
  }

  Future<void> openChannelSettings(String id) async {
    try {
      await _channel.invokeMethod<void>('openChannelSettings', {'id': id});
    } catch (_) {}
  }

  Future<void> openFullScreenSettings() async {
    try {
      await FlutterCallkitIncoming.requestFullIntentPermission();
    } catch (_) {}
  }
}
