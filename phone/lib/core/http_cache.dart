import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';

/// Какие GET-запросы можно показывать из памяти телефона. Всё остальное — звонки, токены,
/// счётчики, сообщения чата — всегда идёт на сервер напрямую.
final List<RegExp> _cacheablePaths = [
  RegExp(r'^/api/calendar/(events|\d{4}-\d{2}-\d{2}|birthdays/week|prayer-section/today-viewers|next-week/members|cycle/collection-claims|dashboard-coordinator-notes)$'),
  RegExp(r'^/api/(feed|stories|resources/podcasts|sermon-notes|broadcasts/(active|history)|calls/history|auth/access-requests)$'),
  RegExp(r'^/api/posts/[^/]+/comments$'),
  RegExp(r'^/api/messenger/conversations$'),
  RegExp(r'^/api/messenger/conversations/[^/]+/(meta|members|private-profile)$'),
  RegExp(r'^/api/(service-plans|service-templates)(/\d+)?$'),
  RegExp(r'^/api/(service-block-types|service-planner-members|studio/setlists|studio/versions)$'),
  RegExp(r'^/api/studio/(setlists/\d+/performance|versions/song/\d+)$'),
  RegExp(r'^/api/sunday-schedule/(plans|my|members)$'),
  RegExp(r'^/api/(media|music)-schedule/(roles|my-schedule|members|events)$'),
  RegExp(r'^/api/profile/\d+$'),
];

bool isCacheablePath(String path) => _cacheablePaths.any((r) => r.hasMatch(path));

/// Изменение в одном разделе обнуляет сохранённое по всем разделам из одной «семьи»:
/// назначили человека в расписании — главная и программа должны показать это сразу.
const Map<String, String> _families = {
  'service-plans': 'service',
  'service-templates': 'service',
  'service-block-types': 'service',
  'service-planner-members': 'service',
  'sunday-schedule': 'service',
  'media-schedule': 'service',
  'music-schedule': 'service',
  'studio': 'service',
  'songs': 'service',
  'calendar': 'calendar',
  'feed': 'feed',
  'stories': 'feed',
  'posts': 'feed',
  'broadcasts': 'broadcasts',
  'sermon-notes': 'sermons',
  'resources': 'sermons',
  'calls': 'calls',
  'call-invitations': 'calls',
  'auth': 'auth',
  'profile': 'profile',
};

String? _familyOf(String path) {
  final parts = path.split('/');
  if (parts.length < 3 || parts[1] != 'api') return null;
  return _families[parts[2]];
}

class _Entry {
  _Entry({required this.path, required this.query, required this.encoded, required this.savedAt});
  final String path;
  final Map<String, dynamic> query;
  String encoded;
  DateTime savedAt;
  DateTime usedAt = DateTime.now();
  DateTime checkedAt = DateTime.fromMillisecondsSinceEpoch(0);
}

/// Копия ответов сервера на телефоне: экран открывается мгновенно с тем, что уже видели,
/// а свежее приходит фоном и сразу обновляет экран ([changes]).
///
/// Кеш личный: у каждого аккаунта своя папка, при выходе всё стирается.
class HttpCache extends Interceptor {
  HttpCache({
    required this.dio,
    required this.userId,
    Future<Directory?> Function()? directory,
    DateTime Function()? clock,
    this.recheckAfter = const Duration(seconds: 3),
    this.maxBytes = 2 * 1024 * 1024,
  })  : _directory = directory ?? (() async => null),
        _clock = clock ?? DateTime.now;

  final Dio dio;
  final int? Function() userId;
  final Future<Directory?> Function() _directory;
  final DateTime Function() _clock;

  /// Не перепроверять один и тот же адрес чаще, чем раз в это время (быстрые повторные открытия).
  final Duration recheckAfter;
  final int maxBytes;

  static const _background = 'httpCacheBackground';
  static const _skip = 'httpCacheSkip';
  static const _stored = 'httpCacheStored';
  static final _freshKey = #httpCacheFresh;

  final Map<String, _Entry> _memory = {};
  final Map<String, Future<void>> _inflight = {};
  final _changes = StreamController<String>.broadcast();

  /// Адреса (`/api/feed`), данные по которым только что изменились.
  Stream<String> get changes => _changes.stream;

  /// Принудительно свежие данные (потянули список вниз): выполняет [body], минуя сохранённое.
  static Future<T> fresh<T>(Future<T> Function() body) => runZoned(body, zoneValues: {_freshKey: true});

  bool get _forceFresh => Zone.current[_freshKey] == true;

  String _key(int user, String path, Map<String, dynamic> query) {
    final keys = query.keys.toList()..sort();
    return '$user|$path?${[for (final k in keys) '$k=${query[k]}'].join('&')}';
  }

  bool _eligible(RequestOptions o) =>
      o.method.toUpperCase() == 'GET' && o.extra[_skip] != true && userId() != null && isCacheablePath(o.path);

  // ——— запрос ———

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (!_eligible(options)) return handler.next(options);
    final user = userId()!;
    final key = _key(user, options.path, options.queryParameters);
    options.extra[_stored] = key;
    if (options.extra[_background] == true || _forceFresh) return handler.next(options);
    // Только память: запрос не ждёт диск. Всё сохранённое подгружается в память при запуске ([warm]).
    final entry = _memory[key];
    if (entry == null) return handler.next(options);
    entry.usedAt = _clock();
    handler.resolve(Response<Object?>(
      requestOptions: options,
      statusCode: 200,
      data: jsonDecode(entry.encoded),
      extra: {'fromCache': true},
    ));
    if (_clock().difference(entry.checkedAt) >= recheckAfter) _revalidate(key, entry);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    final options = response.requestOptions;
    final key = options.extra[_stored];
    if (key is String && response.statusCode == 200 && response.data != null) {
      _save(key, options.path, options.queryParameters, response.data);
    } else if (options.method.toUpperCase() != 'GET' && (response.statusCode ?? 500) < 300) {
      _afterMutation(options.path);
    }
    handler.next(response);
  }

  // ——— сохранение ———

  void _save(String key, String path, Map<String, dynamic> query, Object? data) {
    String encoded;
    try {
      encoded = jsonEncode(data);
    } catch (_) {
      return;
    }
    if (encoded.length > maxBytes) return;
    final now = _clock();
    final old = _memory[key];
    if (old != null) {
      old.checkedAt = now;
      if (old.encoded == encoded) return;
      old.encoded = encoded;
      old.savedAt = now;
    } else {
      _memory[key] = _Entry(path: path, query: Map.of(query), encoded: encoded, savedAt: now)..checkedAt = now;
    }
    unawaited(_writeDisk(key));
    // Если раньше показывали другое — экраны должны перечитаться.
    if (old != null) _changes.add(path);
  }

  /// Фоново спрашивает сервер и, если ответ другой, обновляет сохранённое и сообщает экранам.
  Future<void> _revalidate(String key, _Entry entry) {
    return _inflight.putIfAbsent(key, () async {
      try {
        await dio.get<Object?>(entry.path, queryParameters: entry.query, options: Options(extra: {_background: true}));
      } catch (_) {
        /* нет сети — остаётся то, что уже показано */
      } finally {
        _inflight.remove(key);
      }
    });
  }

  /// После своего изменения устаревшее по «семье» стираем, чтобы не мелькнуло старое значение.
  void _afterMutation(String path) {
    final family = _familyOf(path);
    if (family != null) {
      final dropped = <String>{};
      _memory.removeWhere((key, entry) {
        final hit = _familyOf(entry.path) == family;
        if (hit) {
          dropped.add(entry.path);
          unawaited(_deleteDisk(key));
        }
        return hit;
      });
      dropped.forEach(_changes.add);
      return;
    }
    if (path.startsWith('/api/messenger/') && !path.endsWith('/read')) {
      // Список чатов не стираем (он нужен сразу), а обновляем фоном.
      unawaited(revalidate((p) => p == '/api/messenger/conversations'));
    }
  }

  /// Перепроверить сохранённое, чем недавно пользовались: вернулись в приложение, пришёл пуш.
  Future<void> revalidateRecent({Duration within = const Duration(minutes: 15), int max = 12}) {
    final since = _clock().subtract(within);
    return _revalidateWhere((e) => e.usedAt.isAfter(since), max: max);
  }

  /// Перепроверить сохранённое по адресам, для которых [test] вернул true.
  Future<void> revalidate(bool Function(String path) test, {int max = 12}) => _revalidateWhere((e) => test(e.path), max: max);

  Future<void> _revalidateWhere(bool Function(_Entry entry) test, {required int max, int parallel = 3}) async {
    final user = userId();
    if (user == null) return;
    final due = [
      for (final e in _memory.entries)
        if (e.key.startsWith('$user|') && test(e.value)) e,
    ]..sort((a, b) => b.value.usedAt.compareTo(a.value.usedAt));
    final queue = due.take(max).toList();
    Future<void> worker() async {
      while (queue.isNotEmpty) {
        final next = queue.removeLast();
        await _revalidate(next.key, next.value);
      }
    }

    await Future.wait([for (var i = 0; i < parallel; i++) worker()]);
  }

  /// Забыть сохранённое по адресу (например, пришло событие, что оно устарело).
  void invalidate(String pathPrefix) {
    _memory.removeWhere((key, entry) {
      final hit = entry.path.startsWith(pathPrefix);
      if (hit) unawaited(_deleteDisk(key));
      return hit;
    });
  }

  /// Сохранено ли что-то по адресу (для тестов и диагностики).
  bool has(String path, {Map<String, dynamic> query = const {}}) {
    final user = userId();
    return user != null && _memory.containsKey(_key(user, path, query));
  }

  // ——— диск ———

  Future<File?> _file(int user, String key) async {
    final root = await _directory();
    if (root == null) return null;
    return File('${root.path}/http_cache/$user/${_fnv(key)}.json');
  }

  static String _fnv(String text) {
    var hash = 0xcbf29ce484222325;
    for (final unit in utf8.encode(text)) {
      hash ^= unit;
      hash = (hash * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF;
    }
    return hash.toRadixString(16).padLeft(16, '0');
  }

  Future<void> _writeDisk(String key) async {
    final entry = _memory[key];
    final user = userId();
    if (entry == null || user == null) return;
    try {
      final file = await _file(user, key);
      if (file == null) return;
      await file.parent.create(recursive: true);
      final meta = jsonEncode({'k': key, 'p': entry.path, 'q': entry.query, 't': entry.savedAt.millisecondsSinceEpoch});
      await file.writeAsString('$meta\n${entry.encoded}', flush: true);
    } catch (_) {}
  }

  Future<void> _deleteDisk(String key) async {
    final user = userId();
    if (user == null) return;
    try {
      final file = await _file(user, key);
      if (file != null && await file.exists()) await file.delete();
    } catch (_) {}
  }

  _Entry? _parseFile(String text, {String? expectKey}) {
    final split = text.indexOf('\n');
    if (split <= 0) return null;
    final meta = jsonDecode(text.substring(0, split));
    if (meta is! Map) return null;
    if (expectKey != null && meta['k'] != expectKey) return null;
    final query = meta['q'];
    return _Entry(
      path: '${meta['p']}',
      query: query is Map ? Map<String, dynamic>.from(query) : {},
      encoded: text.substring(split + 1),
      savedAt: DateTime.fromMillisecondsSinceEpoch(meta['t'] is int ? meta['t'] as int : 0),
    );
  }

  /// Подгрузить сохранённое в память при запуске, чтобы первое открытие тоже было мгновенным.
  Future<void> warm() async {
    final user = userId();
    if (user == null) return;
    try {
      final root = await _directory();
      if (root == null) return;
      final dir = Directory('${root.path}/http_cache/$user');
      if (!await dir.exists()) return;
      await for (final item in dir.list()) {
        if (item is! File || !item.path.endsWith('.json')) continue;
        try {
          final text = await item.readAsString();
          final split = text.indexOf('\n');
          if (split <= 0) continue;
          final key = (jsonDecode(text.substring(0, split)) as Map)['k'];
          if (key is String && key.startsWith('$user|') && !_memory.containsKey(key)) {
            final entry = _parseFile(text);
            if (entry != null) _memory[key] = entry;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  /// Выход из аккаунта: стираем всё личное.
  Future<void> clear() async {
    _memory.clear();
    _inflight.clear();
    try {
      final root = await _directory();
      if (root == null) return;
      final dir = Directory('${root.path}/http_cache');
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
  }

  void dispose() => _changes.close();
}
