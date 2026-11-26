import 'dart:async';

import 'package:flutter/foundation.dart';

import 'audio/bible_audio_player.dart';
import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/chapter_index.dart';
import 'logic/quote.dart';
import 'logic/verse_groups.dart';
import 'models/bible_models.dart';

/// Итог нажатия «Закладка».
enum BookmarkResult { added, removed }

/// Читалка: одна лента глав, выделение стихов, заметки, подсветка и запоминание места.
class BibleReaderController extends ChangeNotifier {
  BibleReaderController({
    required this.source,
    required this.store,
    required List<BibleBook> books,
    required this.translation,
    required String bookSlug,
    required int chapter,
    this.focusVerse,
    this.onPosition,
    this.saveDelay = const Duration(seconds: 1),
    this.translations = const [],
    BiblePlayer? audio,
  })  : index = ChapterIndex(books),
        settings = const BibleSettings(),
        audio = audio ?? BiblePlayer.instance {
    page = index.indexOf(bookSlug, chapter) ?? 0;
  }

  /// Переводы нужны только для подписи озвучки («Синод.»).
  final List<BibleTranslation> translations;

  /// Озвучка: плеер общий на всё приложение.
  final BiblePlayer audio;

  final BibleSource source;
  final BibleStore store;
  String translation;
  ChapterIndex index;
  BibleSettings settings;

  /// Стих, к которому нужно прокрутить при открытии (из поиска или ссылки).
  int? focusVerse;
  final void Function(ReadingPosition position)? onPosition;
  final Duration saveDelay;

  late int page;
  final Set<int> selected = {};

  final Map<int, Future<ChapterText>> _chapters = {};
  final Map<int, List<BibleNote>> _notes = {};
  final Map<int, List<BibleBookmark>> _bookmarks = {};
  final Map<int, List<BibleCommentary>> _commentaries = {};
  final Map<int, Future<BibleAudio?>> _audio = {};
  final Map<int, bool> _hasAudio = {};
  final Set<int> _bookmarksLoading = {};
  final Set<int> _commentariesLoading = {};
  final Set<int> _notesLoading = {};
  Map<String, List<int>> _highlights = {};
  Timer? _saveTimer;
  ReadingPosition? _pending;
  bool _disposed = false;

  ({BibleBook book, int chapter}) get current => index.at(page);

  String get title => '${current.book.name} ${current.chapter}';

  Future<void> init() async {
    settings = await store.settings();
    _highlights = await store.highlights();
    _shareContextWithPlayer();
    if (_disposed) return;
    notifyListeners();
    _touch(page);
  }

  // ——— главы ———

  /// Глава загружается один раз; при ошибке запись удаляется, чтобы «Повторить» сработало.
  Future<ChapterText> chapterAt(int pageIndex) {
    final entry = index.at(pageIndex);
    return _chapters.putIfAbsent(pageIndex, () {
      final future = source.chapter(translation, entry.book.slug, entry.chapter);
      // Блок, а не выражение: remove вернул бы тот же упавший Future, и ошибка ушла бы «в никуда».
      future.then<void>((_) {}, onError: (_) {
        _chapters.remove(pageIndex);
      });
      return future;
    });
  }

  void retry(int pageIndex) {
    _chapters.remove(pageIndex);
    notifyListeners();
  }

  void _prefetch(int pageIndex) {
    for (final i in [pageIndex + 1, pageIndex - 1]) {
      if (i < 0 || i >= index.count) continue;
      unawaited(chapterAt(i).then<void>((_) {}, onError: (_) {}));
    }
  }

  /// Страница сменилась свайпом или выбором главы.
  void onPageChanged(int newPage) {
    if (newPage == page) return;
    page = newPage;
    selected.clear();
    focusVerse = null;
    _touch(page);
    notifyListeners();
  }

  /// Плееру нужны книги и источник, чтобы после конца главы сам включить следующую, даже когда читалка закрыта.
  void _shareContextWithPlayer() {
    audio
      ..books = index.books
      ..source = source;
  }

  void _touch(int pageIndex) {
    _prefetch(pageIndex);
    unawaited(loadNotes(pageIndex));
    unawaited(loadBookmarks(pageIndex));
    unawaited(loadCommentaries(pageIndex));
    unawaited(audioAt(pageIndex));
    final entry = index.at(pageIndex);
    _queuePosition(ReadingPosition(
      translation: translation,
      bookSlug: entry.book.slug,
      chapter: entry.chapter,
      verse: focusVerse ?? 1,
      savedAt: DateTime.now(),
    ));
  }

  /// Не пишем на сервер на каждый свайп: берём последнюю остановку.
  void _queuePosition(ReadingPosition position) {
    _pending = position;
    _saveTimer?.cancel();
    _saveTimer = Timer(saveDelay, flushPosition);
  }

  Future<void> flushPosition() async {
    _saveTimer?.cancel();
    final position = _pending;
    _pending = null;
    if (position == null) return;
    onPosition?.call(position);
    await store.remember(position);
    await source.saveServerPosition(position);
  }

  // ——— перевод ———

  Future<void> switchTranslation(BibleTranslation next) async {
    if (next.code == translation) return;
    final slug = current.book.slug;
    final chapter = current.chapter;
    final books = await source.books(next.code);
    if (_disposed || books.isEmpty) return;
    translation = next.code;
    index = ChapterIndex(books);
    // Если такой книги в переводе нет (например, Ветхий Завет в переводе Нового), идём в начало.
    page = index.indexOf(slug, chapter) ?? 0;
    _chapters.clear();
    _notes.clear();
    _bookmarks.clear();
    _commentaries.clear();
    _audio.clear();
    _hasAudio.clear();
    selected.clear();
    _shareContextWithPlayer();
    await store.saveTranslation(next.code);
    _touch(page);
    notifyListeners();
  }

  // ——— выделение ———

  void toggleVerse(int verse) {
    if (!selected.add(verse)) selected.remove(verse);
    notifyListeners();
  }

  void clearSelection() {
    if (selected.isEmpty) return;
    selected.clear();
    notifyListeners();
  }

  /// Текст выбранных стихов для буфера обмена.
  Future<String> selectedQuote() async {
    final text = await chapterAt(page);
    final chosen = [for (final v in text.verses) if (selected.contains(v.number)) v];
    return formatQuote(bookShortName: current.book.shortName, chapter: current.chapter, verses: chosen);
  }

  // ——— подсветка ———

  String _key(int pageIndex) {
    final entry = index.at(pageIndex);
    return BibleStore.chapterKey(translation, entry.book.slug, entry.chapter);
  }

  Set<int> highlightsAt(int pageIndex) => {...?_highlights[_key(pageIndex)]};

  /// Если все выбранные уже выделены — снимает выделение, иначе выделяет все.
  Future<void> toggleHighlightSelected() async {
    if (selected.isEmpty) return;
    final key = _key(page);
    final now = {...?_highlights[key]};
    final allMarked = selected.every(now.contains);
    if (allMarked) {
      now.removeAll(selected);
    } else {
      now.addAll(selected);
    }
    _highlights = {
      for (final e in _highlights.entries)
        if (e.key != key) e.key: e.value,
      if (now.isNotEmpty) key: (now.toList()..sort()),
    };
    selected.clear();
    notifyListeners();
    await store.saveHighlights(_highlights);
  }

  bool get selectionAllHighlighted {
    if (selected.isEmpty) return false;
    final marked = _highlights[_key(page)] ?? const [];
    return selected.every(marked.contains);
  }

  // ——— заметки ———

  List<BibleNote> notesAt(int pageIndex) => _notes[pageIndex] ?? const [];

  Future<void> loadNotes(int pageIndex) async {
    if (_notes.containsKey(pageIndex) || !_notesLoading.add(pageIndex)) return;
    final entry = index.at(pageIndex);
    final tr = translation;
    try {
      final list = await source.notes(translation: tr, bookSlug: entry.book.slug, chapter: entry.chapter);
      if (_disposed || tr != translation) return;
      _notes[pageIndex] = list;
      notifyListeners();
    } catch (_) {
      /* заметки не обязательны для чтения; загрузим при следующем заходе в главу */
    } finally {
      _notesLoading.remove(pageIndex);
    }
  }

  /// Сохраняет заметку к выбранным стихам. Ошибку сети отдаёт наверх — экран покажет понятное сообщение.
  Future<BibleNote> addNote(String body) async {
    final verses = selected.toList()..sort();
    if (verses.isEmpty) throw StateError('Не выбраны стихи');
    final entry = current;
    final note = await source.createNote(
      translation: translation,
      bookSlug: entry.book.slug,
      chapter: entry.chapter,
      verseStart: verses.first,
      verseEnd: verses.last,
      body: body.trim(),
    );
    _notes[page] = [...notesAt(page), note];
    selected.clear();
    notifyListeners();
    return note;
  }

  Future<void> editNote(BibleNote note, String body) async {
    final updated = await source.updateNote(note.id, body.trim());
    _notes[page] = [for (final n in notesAt(page)) n.id == note.id ? updated : n];
    notifyListeners();
  }

  Future<void> removeNote(BibleNote note) async {
    await source.deleteNote(note.id);
    _notes[page] = [for (final n in notesAt(page)) if (n.id != note.id) n];
    notifyListeners();
  }

  // ——— закладки ———

  List<BibleBookmark> bookmarksAt(int pageIndex) => _bookmarks[pageIndex] ?? const [];

  /// Стихи главы, на которых есть закладка, — в тексте у них значок.
  Set<int> bookmarkedVersesAt(int pageIndex) => {
        for (final b in bookmarksAt(pageIndex))
          for (var v = b.verseStart; v <= b.verseEnd; v++) v,
      };

  Future<void> loadBookmarks(int pageIndex) async {
    if (_bookmarks.containsKey(pageIndex) || !_bookmarksLoading.add(pageIndex)) return;
    final entry = index.at(pageIndex);
    final tr = translation;
    try {
      final list = await source.bookmarks(translation: tr, bookSlug: entry.book.slug, chapter: entry.chapter);
      if (_disposed || tr != translation) return;
      _bookmarks[pageIndex] = list;
      notifyListeners();
    } catch (_) {
      /* закладки не нужны, чтобы читать; загрузим при следующем заходе в главу */
    } finally {
      _bookmarksLoading.remove(pageIndex);
    }
  }

  /// Кнопка в панели действий подписана «Убрать», если выбранное уже в закладках точно.
  bool get selectionBookmarked => selected.isNotEmpty && planBookmarkToggle(selected, bookmarksAt(page)).remove.isNotEmpty;

  /// Ставит или снимает закладку на выбранные стихи. Ошибку сети отдаёт наверх.
  Future<BookmarkResult> toggleBookmarkSelected() async {
    if (selected.isEmpty) throw StateError('Не выбраны стихи');
    final entry = current;
    final plan = planBookmarkToggle(selected, bookmarksAt(page));
    var list = [...bookmarksAt(page)];
    if (plan.remove.isNotEmpty) {
      for (final b in plan.remove) {
        await source.deleteBookmark(b.id);
        list = [for (final x in list) if (x.id != b.id) x];
      }
      _bookmarks[page] = list;
      notifyListeners();
      return BookmarkResult.removed;
    }
    for (final span in plan.add) {
      list.add(await source.createBookmark(
        translation: translation,
        bookSlug: entry.book.slug,
        chapter: entry.chapter,
        verseStart: span.start,
        verseEnd: span.end,
      ));
    }
    _bookmarks[page] = list;
    selected.clear();
    notifyListeners();
    return BookmarkResult.added;
  }

  // ——— комментарии ———

  List<BibleCommentary> commentariesAt(int pageIndex) => _commentaries[pageIndex] ?? const [];

  Future<void> loadCommentaries(int pageIndex) async {
    if (_commentaries.containsKey(pageIndex) || !_commentariesLoading.add(pageIndex)) return;
    final entry = index.at(pageIndex);
    final tr = translation;
    try {
      final list = await source.commentaries(tr, entry.book.slug, entry.chapter);
      if (_disposed || tr != translation) return;
      _commentaries[pageIndex] = list;
      notifyListeners();
    } catch (_) {
      /* комментарии — дополнение к тексту */
    } finally {
      _commentariesLoading.remove(pageIndex);
    }
  }

  // ——— озвучка ———

  /// Есть ли запись для главы; результат запоминается, чтобы не спрашивать сервер снова.
  Future<BibleAudio?> audioAt(int pageIndex) {
    final entry = index.at(pageIndex);
    return _audio.putIfAbsent(pageIndex, () {
      final future = source.audio(translation, entry.book.slug, entry.chapter).then<BibleAudio?>((value) => value, onError: (Object _) {
        // Временный сбой не запоминаем: при следующем обращении спросим сервер заново.
        _audio.remove(pageIndex);
        return null;
      });
      future.then<void>((value) {
        if (_disposed || !_audio.containsKey(pageIndex)) return;
        _hasAudio[pageIndex] = value != null;
        notifyListeners();
      });
      return future;
    });
  }

  /// Известно ли уже, что у главы есть озвучка (панель действий показывает «Слушать»).
  bool hasAudioAt(int pageIndex) => _hasAudio[pageIndex] ?? false;

  String get _translationTitle {
    for (final t in translations) {
      if (t.code == translation) return t.shortTitle;
    }
    return translation;
  }

  /// Включает озвучку главы [pageIndex] (по умолчанию — открытой), при желании со стиха [fromVerse].
  /// false — для главы нет записи.
  Future<bool> listen({int? pageIndex, int? fromVerse}) async {
    final at = pageIndex ?? page;
    final recording = await audioAt(at);
    if (recording == null || _disposed) return false;
    final entry = index.at(at);
    _shareContextWithPlayer();
    await audio.playChapter(
      BibleTrack(
        translation: translation,
        translationTitle: _translationTitle,
        bookSlug: entry.book.slug,
        bookName: entry.book.name,
        chapter: entry.chapter,
        audio: recording,
      ),
      fromVerse: fromVerse,
    );
    return true;
  }

  /// Звучит ли сейчас глава [pageIndex].
  bool isPlayingPage(int pageIndex) {
    final entry = index.at(pageIndex);
    return audio.isCurrent(translation, entry.book.slug, entry.chapter);
  }

  // ——— настройки ———

  Future<void> updateSettings(BibleSettings next) async {
    settings = next;
    notifyListeners();
    await store.saveSettings(next);
  }

  @override
  void dispose() {
    _disposed = true;
    // Последнюю остановку не теряем, даже если закрыли экран раньше таймера.
    if (_pending != null) unawaited(flushPosition());
    _saveTimer?.cancel();
    super.dispose();
  }
}
