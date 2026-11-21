import 'dart:async';

import 'package:flutter/foundation.dart';

import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/chapter_index.dart';
import 'logic/quote.dart';
import 'models/bible_models.dart';

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
  })  : index = ChapterIndex(books),
        settings = const BibleSettings() {
    page = index.indexOf(bookSlug, chapter) ?? 0;
  }

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

  void _touch(int pageIndex) {
    _prefetch(pageIndex);
    unawaited(loadNotes(pageIndex));
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
    selected.clear();
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
