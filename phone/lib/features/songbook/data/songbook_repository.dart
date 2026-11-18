import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/song.dart';

/// Сохранённый на телефоне список песен.
class SongbookSnapshot {
  const SongbookSnapshot(this.songs, this.savedAt);
  final List<Song> songs;
  final DateTime savedAt;
}

/// Версия песни музыканта из студии: свой текст и тональность.
class SongVersion {
  const SongVersion({this.content, this.key});
  final String? content;
  final String? key;
}

/// Откуда контроллер берёт песни. Отдельный интерфейс — чтобы проверять без сети.
abstract class SongbookSource {
  Future<SongbookSnapshot?> readCache();
  Future<List<Song>> fetch();
  Future<void> writeCache(List<Song> songs);
  Future<void> setFavorite(int songId, bool value);
  Future<void> recordOpened(int songId);
  Future<SongVersion?> studioVersion(int songId);
}

/// Песни с сервера + копия в файле: песенник нужен и там, где нет интернета.
class SongbookRepository implements SongbookSource {
  SongbookRepository(this.session, {Future<Directory?> Function()? cacheDirectory})
      : _cacheDirectory = cacheDirectory ?? _defaultDirectory;

  final SessionController session;
  final Future<Directory?> Function() _cacheDirectory;

  static Future<Directory?> _defaultDirectory() async {
    try {
      return await getApplicationSupportDirectory();
    } catch (_) {
      return null; // веб и тесты без плагина: работаем без копии
    }
  }

  /// Копия принадлежит человеку: в ней его избранное.
  Future<File?> _file() async {
    final dir = await _cacheDirectory();
    final user = session.user?.id;
    if (dir == null || user == null) return null;
    return File('${dir.path}/songbook_$user.json');
  }

  @override
  Future<SongbookSnapshot?> readCache() async {
    try {
      final file = await _file();
      if (file == null || !await file.exists()) return null;
      final data = asMap(jsonDecode(await file.readAsString()));
      // Список с другого сервера нам не подходит.
      if (str(data['origin']) != session.apiOrigin) return null;
      final songs = [for (final raw in asList(data['songs'])) Song.fromJson(asMap(raw))];
      if (songs.isEmpty) return null;
      return SongbookSnapshot(songs, DateTime.tryParse(str(data['savedAt'])) ?? DateTime.now());
    } catch (_) {
      return null; // повреждённая копия — как будто её нет
    }
  }

  @override
  Future<void> writeCache(List<Song> songs) async {
    try {
      final file = await _file();
      if (file == null) return;
      final body = jsonEncode({
        'origin': session.apiOrigin,
        'savedAt': DateTime.now().toIso8601String(),
        'songs': [for (final s in songs) s.toJson()],
      });
      // Сначала во временный файл: оборванная запись не испортит рабочую копию.
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(body, flush: true);
      await tmp.rename(file.path);
    } catch (_) {}
  }

  @override
  Future<List<Song>> fetch() async {
    final response = await session.dio.get<Object?>('/api/songs');
    final data = response.data;
    if (data is! List) throw DioException(requestOptions: response.requestOptions, message: 'Неожиданный ответ сервера');
    return [
      for (final raw in data)
        if (Song.fromJson(asMap(raw)) case final song when song.id > 0 && song.title.isNotEmpty) song,
    ];
  }

  @override
  Future<void> setFavorite(int songId, bool value) async {
    final path = '/api/songs/$songId/favorite';
    if (value) {
      await session.dio.post<Object?>(path);
    } else {
      await session.dio.delete<Object?>(path);
    }
  }

  @override
  Future<void> recordOpened(int songId) async {
    try {
      await session.dio.post<Object?>('/api/songs/$songId/open');
    } catch (_) {
      /* статистика не должна мешать петь */
    }
  }

  @override
  Future<SongVersion?> studioVersion(int songId) async {
    try {
      final response = await session.dio.get<Object?>('/api/studio/versions/song/$songId');
      final data = asMap(response.data);
      final content = str(data['custom_content']);
      final key = str(data['custom_key']);
      if (content.trim().isEmpty && key.trim().isEmpty) return null;
      return SongVersion(content: content.trim().isEmpty ? null : content, key: key.trim().isEmpty ? null : key);
    } catch (_) {
      return null;
    }
  }

  /// После выхода из аккаунта чужое избранное на телефоне не оставляем.
  static Future<void> clearAll() async {
    try {
      final dir = await _defaultDirectory();
      if (dir == null) return;
      for (final entity in dir.listSync()) {
        final name = entity.path.split('/').last;
        if (entity is File && name.startsWith('songbook_')) await entity.delete();
      }
    } catch (_) {}
  }
}
