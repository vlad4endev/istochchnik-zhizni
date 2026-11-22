import 'dart:async';

import 'package:flutter/foundation.dart';

import 'church_api.dart';
import 'session.dart';

/// Число непрочитанных чатов для значка на вкладке «Чаты». Обновляется после прочтения чата,
/// при новых сообщениях и при возврате в приложение.
class UnreadBadge extends ChangeNotifier {
  UnreadBadge._();
  static final UnreadBadge instance = UnreadBadge._();

  int count = 0;
  Timer? _debounce;

  Future<void> refresh(SessionController session) async {
    try {
      final value = await ChurchApi(session).unread();
      if (value != count) {
        count = value;
        notifyListeners();
      }
    } catch (_) {
      /* значок останется прежним */
    }
  }

  /// Обновить не чаще раза в [delay]: сообщения могут приходить пачкой.
  void refreshSoon(SessionController session, {Duration delay = const Duration(milliseconds: 600)}) {
    _debounce?.cancel();
    _debounce = Timer(delay, () => unawaited(refresh(session)));
  }

  void reset() {
    _debounce?.cancel();
    if (count != 0) {
      count = 0;
      notifyListeners();
    }
  }
}
