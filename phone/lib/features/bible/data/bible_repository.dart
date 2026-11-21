import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/bible_models.dart';
import 'book_catalog.dart';

/// Откуда экраны Библии берут данные. Отдельный интерфейс — чтобы проверять без сети.
abstract class BibleSource {
  Future<List<BibleTranslation>> translations();
  Future<List<BibleBook>> books(String translation);
  Future<ChapterText> chapter(String translation, String bookSlug, int chapter);
  Future<List<VerseHit>> search(String translation, String query);
  Future<ReadingPosition?> serverPosition(String translation);
  Future<void> saveServerPosition(ReadingPosition position);
  Future<List<BibleNote>> notes({String? translation, String? bookSlug, int? chapter});
  Future<BibleNote> createNote({
    required String translation,
    required String bookSlug,
    required int chapter,
    required int verseStart,
    required int verseEnd,
    required String body,
  });
  Future<BibleNote> updateNote(int id, String body);
  Future<void> deleteNote(int id);
}

/// Текст Писания не меняется, поэтому прочитанные главы лежат в файлах на телефоне
/// и открываются без сети. Заметки и место чтения хранятся на сервере.
class BibleRepository implements BibleSource {
  BibleRepository(this.session, {Future<Directory?> Function()? cacheDirectory})
      : _cacheDirectory = cacheDirectory ?? _defaultDirectory;

  final SessionController session;
  final Future<Directory?> Function() _cacheDirectory;

  static Future<Directory?> _defaultDirectory() async {
    try {
      final base = await getApplicationSupportDirectory();
      final dir = Directory('${base.path}/bible');
      if (!await dir.exists()) await dir.create(recursive: true);
      return dir;
    } catch (_) {
      return null; // веб и тесты без плагина: работаем без копии
    }
  }

  Future<File?> _file(String relative) async {
    final dir = await _cacheDirectory();
    if (dir == null) return null;
    final file = File('${dir.path}/$relative');
    final parent = file.parent;
    if (!await parent.exists()) await parent.create(recursive: true);
    return file;
  }

  Future<Object?> _readJson(String relative) async {
    try {
      final file = await _file(relative);
      if (file == null || !await file.exists()) return null;
      return jsonDecode(await file.readAsString());
    } catch (_) {
      return null; // повреждённая копия — как будто её нет
    }
  }

  Future<void> _writeJson(String relative, Object data) async {
    try {
      final file = await _file(relative);
      if (file == null) return;
      // Сначала во временный файл: оборванная запись не испортит рабочую копию.
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode(data), flush: true);
      await tmp.rename(file.path);
    } catch (_) {}
  }

  @override
  Future<List<BibleTranslation>> translations() async {
    final cached = await _readJson('translations.json');
    final fromCache = [
      for (final raw in asList(cached))
        if (BibleTranslation.fromJson(asMap(raw)) case final t when t.code.isNotEmpty) t,
    ];
    if (fromCache.isNotEmpty) {
      unawaited(_refreshTranslations());
      return fromCache;
    }
    try {
      return await _refreshTranslations() ?? const [BibleTranslation.synodal];
    } catch (_) {
      return const [BibleTranslation.synodal];
    }
  }

  Future<List<BibleTranslation>?> _refreshTranslations() async {
    try {
      final response = await session.dio.get<Object?>('/api/bible/translations');
      final list = [
        for (final raw in asList(asMap(response.data)['translations']))
          if (BibleTranslation.fromJson(asMap(raw)) case final t when t.code.isNotEmpty) t,
      ];
      if (list.isEmpty) return null;
      await _writeJson('translations.json', [for (final t in list) t.toJson()]);
      return list;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<List<BibleBook>> books(String translation) async {
    final cached = await _readJson('$translation/books.json');
    final fromCache = [for (final raw in asList(cached)) BibleBook.fromJson(asMap(raw))];
    if (fromCache.isNotEmpty) {
      unawaited(_refreshBooks(translation));
      return fromCache;
    }
    final fresh = await _refreshBooks(translation);
    if (fresh != null && fresh.isNotEmpty) return fresh;
    // Совсем без сети и без копии: список книг всегда известен приложению.
    if (translation == 'synodal') return [for (final def in bibleBooks) BibleBook.fromDef(def)];
    throw DioException(requestOptions: RequestOptions(path: '/api/bible/books'), message: 'Нет связи с сервером');
  }

  Future<List<BibleBook>?> _refreshBooks(String translation) async {
    try {
      final response = await session.dio.get<Object?>('/api/bible/books', queryParameters: {'translation': translation});
      final list = [
        for (final raw in asList(asMap(response.data)['books']))
          if (BibleBook.fromJson(asMap(raw)) case final b when b.slug.isNotEmpty) b,
      ];
      if (list.isEmpty) return null;
      await _writeJson('$translation/books.json', [for (final b in list) b.toJson()]);
      return list;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<ChapterText> chapter(String translation, String bookSlug, int chapter) async {
    final path = '$translation/$bookSlug-$chapter.json';
    final cached = await _readJson(path);
    if (cached is Map) {
      final text = ChapterText.fromJson(asMap(cached), translation: translation, bookSlug: bookSlug, chapter: chapter);
      if (text.verses.isNotEmpty) return text;
    }
    final response = await session.dio.get<Object?>('/api/bible/chapter/$translation/$bookSlug/$chapter');
    final json = asMap(response.data);
    final text = ChapterText.fromJson(json, translation: translation, bookSlug: bookSlug, chapter: chapter);
    if (text.verses.isEmpty) {
      throw DioException(requestOptions: response.requestOptions, message: 'В этом переводе нет текста этой главы');
    }
    await _writeJson(path, text.toJson());
    return text;
  }

  @override
  Future<List<VerseHit>> search(String translation, String query) async {
    final response = await session.dio.get<Object?>(
      '/api/bible/search',
      queryParameters: {'translation': translation, 'q': query},
    );
    return [for (final raw in asList(asMap(response.data)['results'])) VerseHit.fromJson(asMap(raw))];
  }

  @override
  Future<ReadingPosition?> serverPosition(String translation) async {
    try {
      final response = await session.dio.get<Object?>('/api/bible/progress', queryParameters: {'translation': translation});
      return ReadingPosition.fromServer(asMap(response.data)['progress'], translation);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> saveServerPosition(ReadingPosition position) async {
    try {
      await session.dio.put<Object?>('/api/bible/progress', data: {
        'translation': position.translation,
        'book_slug': position.bookSlug,
        'chapter': position.chapter,
        'verse': position.verse,
      });
    } catch (_) {
      /* место чтения запомнено и на телефоне; сервер получит его при следующем чтении */
    }
  }

  @override
  Future<List<BibleNote>> notes({String? translation, String? bookSlug, int? chapter}) async {
    final response = await session.dio.get<Object?>('/api/bible/notes', queryParameters: {
      if (translation != null && bookSlug != null && chapter != null) ...{
        'translation': translation,
        'book': bookSlug,
        'chapter': chapter,
      },
    });
    return [for (final raw in asList(asMap(response.data)['notes'])) BibleNote.fromJson(asMap(raw))];
  }

  @override
  Future<BibleNote> createNote({
    required String translation,
    required String bookSlug,
    required int chapter,
    required int verseStart,
    required int verseEnd,
    required String body,
  }) async {
    final response = await session.dio.post<Object?>('/api/bible/notes', data: {
      'translation': translation,
      'book_slug': bookSlug,
      'chapter': chapter,
      'verse_start': verseStart,
      'verse_end': verseEnd,
      'body': body,
    });
    return BibleNote.fromJson(asMap(response.data));
  }

  @override
  Future<BibleNote> updateNote(int id, String body) async {
    final response = await session.dio.patch<Object?>('/api/bible/notes/$id', data: {'body': body});
    return BibleNote.fromJson(asMap(response.data));
  }

  @override
  Future<void> deleteNote(int id) async {
    await session.dio.delete<Object?>('/api/bible/notes/$id');
  }
}
