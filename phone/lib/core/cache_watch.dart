import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'session.dart';

/// Экран, который перечитывает себя, когда в фоне пришли новые данные по его адресам.
///
/// Пример: `watchCache(['/api/feed', '/api/stories'], _reload)` — лента обновится сама,
/// как только сервер вернёт то, чего у нас ещё не было.
mixin CacheWatcher<T extends StatefulWidget> on State<T> {
  final List<StreamSubscription<String>> _cacheSubs = [];
  Timer? _cacheDebounce;

  void watchCache(List<String> pathPrefixes, VoidCallback onChange, {Duration debounce = const Duration(milliseconds: 200)}) {
    final session = context.read<SessionController>();
    _cacheSubs.add(session.cache.changes.where((path) => pathPrefixes.any(path.startsWith)).listen((_) {
      _cacheDebounce?.cancel();
      _cacheDebounce = Timer(debounce, () {
        if (mounted) onChange();
      });
    }));
  }

  @override
  void dispose() {
    _cacheDebounce?.cancel();
    for (final sub in _cacheSubs) {
      sub.cancel();
    }
    super.dispose();
  }
}
