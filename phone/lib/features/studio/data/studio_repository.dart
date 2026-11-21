import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/studio_models.dart';

class Loaded<T> {
  const Loaded(this.value, {this.staleSince});
  final T value;
  final DateTime? staleSince;
}

abstract class StudioSource {
  Future<Loaded<List<Setlist>>> setlists();
  Future<Loaded<SetlistDetail>> performance(int setlistId);
  Future<Setlist> createSetlist(String title, DateTime? date);
  Future<void> patchSetlist(int id, {String? title, DateTime? date, bool clearDate = false, bool? isPublic});
  Future<void> deleteSetlist(int id);
  Future<void> addItem(int setlistId, {required int songId, int? versionId});
  Future<void> removeItem(int setlistId, int itemId);
  Future<void> reorder(int setlistId, List<int> orderedItemIds);
  Future<List<MyVersion>> myVersions();
}

String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Сетлисты нужны на репетиции и на сцене, где связь бывает плохой: последние загруженные лежат в файлах на телефоне.
class StudioRepository implements StudioSource {
  StudioRepository(this.session, {Future<Directory?> Function()? cacheDirectory}) : _cacheDirectory = cacheDirectory ?? _defaultDirectory;

  final SessionController session;
  final Future<Directory?> Function() _cacheDirectory;

  static Future<Directory?> _defaultDirectory() async {
    try {
      return await getApplicationSupportDirectory();
    } catch (_) {
      return null;
    }
  }

  Future<File?> _file(String name) async {
    final dir = await _cacheDirectory();
    final user = session.user?.id;
    if (dir == null || user == null) return null;
    return File('${dir.path}/studio_${name}_$user.json');
  }

  Future<void> _write(String name, Object data) async {
    try {
      final file = await _file(name);
      if (file == null) return;
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode({'origin': session.apiOrigin, 'savedAt': DateTime.now().toIso8601String(), 'data': data}), flush: true);
      await tmp.rename(file.path);
    } catch (_) {}
  }

  Future<({Object? data, DateTime savedAt})?> _read(String name) async {
    try {
      final file = await _file(name);
      if (file == null || !await file.exists()) return null;
      final json = asMap(jsonDecode(await file.readAsString()));
      if (str(json['origin']) != session.apiOrigin) return null;
      return (data: json['data'], savedAt: DateTime.tryParse(str(json['savedAt'])) ?? DateTime.now());
    } catch (_) {
      return null;
    }
  }

  /// После выхода чужие сетлисты на телефоне не оставляем.
  static Future<void> clearAll() async {
    try {
      final dir = await _defaultDirectory();
      if (dir == null) return;
      await for (final entity in dir.list()) {
        if (entity is File && entity.uri.pathSegments.last.startsWith('studio_')) await entity.delete();
      }
    } catch (_) {}
  }

  List<Setlist> _setlists(Object? raw) => [for (final item in asList(raw)) ?Setlist.fromJson(asMap(item))];

  SetlistDetail? _detail(Object? raw) {
    final json = asMap(raw);
    final setlist = Setlist.fromJson(asMap(json['setlist']));
    if (setlist == null) return null;
    final items = [for (final item in asList(json['items'])) SetlistItem.fromJson(asMap(item))]..sort((a, b) => a.position.compareTo(b.position));
    return SetlistDetail(setlist: setlist, items: items);
  }

  @override
  Future<Loaded<List<Setlist>>> setlists() async {
    try {
      final response = await session.dio.get<Object?>('/api/studio/setlists');
      final raw = asList(response.data);
      await _write('list', raw);
      return Loaded(_setlists(raw));
    } catch (_) {
      final cached = await _read('list');
      if (cached == null) rethrow;
      return Loaded(_setlists(cached.data), staleSince: cached.savedAt);
    }
  }

  @override
  Future<Loaded<SetlistDetail>> performance(int setlistId) async {
    try {
      final response = await session.dio.get<Object?>('/api/studio/setlists/$setlistId/performance');
      final raw = asMap(response.data);
      final detail = _detail(raw);
      if (detail == null) throw StateError('Пустой ответ сервера');
      await _write('set_$setlistId', raw);
      return Loaded(detail);
    } catch (_) {
      final cached = await _read('set_$setlistId');
      final detail = cached == null ? null : _detail(cached.data);
      if (cached == null || detail == null) rethrow;
      return Loaded(detail, staleSince: cached.savedAt);
    }
  }

  @override
  Future<Setlist> createSetlist(String title, DateTime? date) async {
    final response = await session.dio.post<Object?>('/api/studio/setlists', data: {'title': title.trim(), 'event_date': date == null ? null : _ymd(date)});
    final created = Setlist.fromJson(asMap(response.data));
    if (created == null) throw StateError('Сервер не вернул сетлист');
    return created;
  }

  @override
  Future<void> patchSetlist(int id, {String? title, DateTime? date, bool clearDate = false, bool? isPublic}) async {
    await session.dio.patch<Object?>('/api/studio/setlists/$id', data: {
      'title': ?title?.trim(),
      if (date != null) 'event_date': _ymd(date),
      if (clearDate) 'event_date': null,
      'is_public': ?isPublic,
    });
  }

  @override
  Future<void> deleteSetlist(int id) async {
    await session.dio.delete<Object?>('/api/studio/setlists/$id');
  }

  @override
  Future<void> addItem(int setlistId, {required int songId, int? versionId}) async {
    await session.dio.post<Object?>('/api/studio/setlists/$setlistId/items', data: {'song_id': songId, 'studio_version_id': versionId});
  }

  @override
  Future<void> removeItem(int setlistId, int itemId) async {
    await session.dio.delete<Object?>('/api/studio/setlists/$setlistId/items/$itemId');
  }

  @override
  Future<void> reorder(int setlistId, List<int> orderedItemIds) async {
    await session.dio.post<Object?>('/api/studio/setlists/$setlistId/reorder', data: {'ordered_item_ids': orderedItemIds});
  }

  @override
  Future<List<MyVersion>> myVersions() async {
    final response = await session.dio.get<Object?>('/api/studio/versions');
    return [for (final raw in asList(response.data)) ?MyVersion.fromJson(asMap(raw))];
  }
}
