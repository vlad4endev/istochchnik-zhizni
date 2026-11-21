import 'dart:async';

import 'package:flutter/foundation.dart';

import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/bible_ref.dart';
import 'models/bible_models.dart';

/// Главный экран Библии: перевод, книги, «продолжить чтение» и поиск.
class BibleController extends ChangeNotifier {
  BibleController(this.source, {BibleStore? store, this.searchDelay = const Duration(milliseconds: 350)})
      : store = store ?? BibleStore();

  final BibleSource source;
  final BibleStore store;
  final Duration searchDelay;

  bool loading = true;
  String? error;

  List<BibleTranslation> translations = const [BibleTranslation.synodal];
  String translationCode = 'synodal';
  List<BibleBook> books = const [];
  ReadingPosition? position;
  List<ReadingPosition> recent = const [];

  BibleQuery query = BibleQuery.parse('');
  List<VerseHit> hits = const [];
  bool searching = false;
  String? searchError;

  Timer? _debounce;
  int _searchToken = 0;
  bool _disposed = false;

  BibleTranslation get translation =>
      translations.firstWhere((t) => t.code == translationCode, orElse: () => BibleTranslation.synodal);

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    translationCode = await store.translation();
    position = await store.position();
    recent = await store.recent();
    translations = await source.translations();
    // Сохранённый перевод могли убрать на сервере.
    if (!translations.any((t) => t.code == translationCode && t.hasText)) translationCode = 'synodal';
    await _loadBooks();
    if (_disposed) return;
    loading = false;
    notifyListeners();
    unawaited(_syncServerPosition());
  }

  Future<void> _loadBooks() async {
    try {
      books = await source.books(translationCode);
      error = null;
    } catch (_) {
      books = const [];
      error = 'Не удалось загрузить список книг. Проверьте интернет и попробуйте снова.';
    }
  }

  /// Место чтения с другого устройства подхватываем, только если оно новее.
  Future<void> _syncServerPosition() async {
    final remote = await source.serverPosition(translationCode);
    if (_disposed || remote == null) return;
    final local = position;
    final remoteNewer = local == null || (remote.savedAt != null && (local.savedAt == null || remote.savedAt!.isAfter(local.savedAt!)));
    if (!remoteNewer) return;
    position = remote;
    notifyListeners();
  }

  Future<void> setTranslation(String code) async {
    if (code == translationCode) return;
    translationCode = code;
    await store.saveTranslation(code);
    loading = true;
    notifyListeners();
    await _loadBooks();
    // Место чтения в другом переводе может не существовать (например, Ветхий Завет в переводе Нового).
    final p = position;
    if (p != null && !books.any((b) => b.slug == p.bookSlug)) position = null;
    if (_disposed) return;
    loading = false;
    notifyListeners();
    if (query.kind == BibleQueryKind.text) _scheduleSearch();
  }

  /// Читалка сообщает, где человек остановился.
  Future<void> remember(ReadingPosition value) async {
    position = value;
    recent = await store.remember(value);
    if (!_disposed) notifyListeners();
  }

  void setQuery(String raw) {
    query = BibleQuery.parse(raw);
    _debounce?.cancel();
    _searchToken++;
    hits = const [];
    searchError = null;
    searching = false;
    if (query.kind == BibleQueryKind.text && query.raw.length >= 2) {
      searching = true;
      _scheduleSearch();
    }
    notifyListeners();
  }

  void _scheduleSearch() {
    _debounce?.cancel();
    final token = ++_searchToken;
    final text = query.raw;
    searching = true;
    _debounce = Timer(searchDelay, () => _runSearch(text, token));
  }

  Future<void> _runSearch(String text, int token) async {
    try {
      final result = await source.search(translationCode, text);
      if (token != _searchToken || _disposed) return;
      hits = result;
      searchError = null;
    } catch (_) {
      if (token != _searchToken || _disposed) return;
      hits = const [];
      searchError = 'Поиск по тексту работает только с интернетом. Ссылки вроде «Ин 3:16» находятся и без сети.';
    }
    searching = false;
    notifyListeners();
  }

  List<BibleBook> booksOf({required bool newTestament}) => [for (final b in books) if (b.isNewTestament == newTestament) b];

  BibleBook? bookBySlugInList(String slug) {
    for (final b in books) {
      if (b.slug == slug) return b;
    }
    return null;
  }

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    super.dispose();
  }
}
