import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/church_api.dart';
import 'data/songbook_repository.dart';
import 'logic/chords.dart';
import 'logic/song_search.dart';
import 'models/song.dart';

class SongGroup {
  const SongGroup(this.letter, this.songs);
  final String letter;
  final List<Song> songs;
}

class TagCount {
  const TagCount(this.name, this.count);
  final String name;
  final int count;
}

/// Состояние списка песен: данные, поиск, фильтры, избранное.
class SongbookController extends ChangeNotifier {
  SongbookController(this.source);

  final SongbookSource source;

  static const _sortKey = 'songbook_sort';

  List<Song> _songs = const [];
  Map<int, Song> _byId = const {};
  SongIndex _index = SongIndex(const []);
  final Map<int, bool> _pendingFavorites = {};

  bool loading = true;
  bool refreshing = false;

  /// Ошибка, когда показать совсем нечего.
  String? error;

  /// Дата сохранённого списка, если свежие данные получить не удалось.
  DateTime? staleSince;

  String _query = '';
  SongFilters _filters = const SongFilters();
  SongSort _sort = SongSort.alphabetical;

  List<SearchHit> _hits = const [];
  List<SongGroup> _groups = const [];
  List<Song> _flat = const [];
  int _filteredCount = 0;
  int favoriteCount = 0;
  List<TagCount> tags = const [];
  List<TagCount> keys = const [];
  bool hasTempo = false;
  bool _disposed = false;

  String get query => _query;
  SongFilters get filters => _filters;
  SongSort get sort => _sort;
  bool get hasSongs => _songs.isNotEmpty;
  int get total => _songs.length;
  bool get searching => _query.trim().isNotEmpty;

  /// Результаты поиска, лучшие первыми. Пусто, если ничего не ищут.
  List<SearchHit> get hits => _hits;

  /// Песни по буквам (сортировка по алфавиту, поиска нет).
  List<SongGroup> get groups => _groups;

  /// Песни одним списком (сортировка по номеру).
  List<Song> get flat => _flat;

  /// Сколько песен подошло под поиск и фильтры.
  int get shownCount => searching ? _hits.length : _filteredCount;

  Song current(Song song) => _byId[song.id] ?? song;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  // ------------------------------------------------------------ загрузка

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _sort = prefs.getString(_sortKey) == 'number' ? SongSort.number : SongSort.alphabetical;
    final cached = await source.readCache();
    if (cached != null) {
      _setSongs(cached.songs);
      staleSince = cached.savedAt;
      loading = false;
      _notify();
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (refreshing) return;
    refreshing = true;
    _notify();
    try {
      final fresh = await source.fetch();
      _setSongs(fresh);
      staleSince = null;
      error = null;
      unawaited(source.writeCache(_songs));
    } catch (e) {
      if (_songs.isEmpty) {
        error = describeDio(e);
      } else {
        staleSince ??= DateTime.now();
      }
    } finally {
      loading = false;
      refreshing = false;
      _notify();
    }
  }

  void _setSongs(List<Song> songs) {
    // Избранное, которое человек только что нажал, важнее ответа сервера.
    _songs = [
      for (final s in songs) _pendingFavorites.containsKey(s.id) ? s.copyWith(favorite: _pendingFavorites[s.id]) : s,
    ];
    _byId = {for (final s in _songs) s.id: s};
    _index = SongIndex(_songs);
    _collectStats();
    _recompute();
  }

  void _collectStats() {
    final tagMap = <String, int>{};
    final keyMap = <String, int>{};
    var tempo = false;
    for (final s in _songs) {
      for (final t in s.visibleTags) {
        tagMap[t] = (tagMap[t] ?? 0) + 1;
      }
      final k = s.keyLabel;
      if (k != null) keyMap[k] = (keyMap[k] ?? 0) + 1;
      if (s.tempo != null) tempo = true;
    }
    tags = [for (final e in tagMap.entries) TagCount(e.key, e.value)]
      ..sort((a, b) => b.count != a.count ? b.count.compareTo(a.count) : a.name.compareTo(b.name));
    int keyOrder(String k) {
      final c = ChordSymbol.tryParse(k, allowCyrillic: true);
      return c == null ? 99 : c.root * 2 + (c.isMinor ? 1 : 0);
    }

    keys = [for (final e in keyMap.entries) TagCount(e.key, e.value)]
      ..sort((a, b) {
        final byKey = keyOrder(a.name).compareTo(keyOrder(b.name));
        return byKey != 0 ? byKey : a.name.compareTo(b.name);
      });
    hasTempo = tempo;
  }

  // ------------------------------------------------------------ поиск и фильтры

  void setQuery(String value) {
    if (value == _query) return;
    _query = value;
    _recompute();
    _notify();
  }

  void setFilters(SongFilters value) {
    _filters = value;
    _recompute();
    _notify();
  }

  void toggleFavoritesOnly() => setFilters(_filters.copyWith(favoritesOnly: !_filters.favoritesOnly));

  void toggleTag(String tag) {
    final next = {..._filters.tags};
    if (!next.remove(tag)) next.add(tag);
    setFilters(_filters.copyWith(tags: next));
  }

  void clearFilters() => setFilters(const SongFilters());

  void clearAll() {
    _query = '';
    _filters = const SongFilters();
    _recompute();
    _notify();
  }

  Future<void> setSort(SongSort value) async {
    if (value == _sort) return;
    _sort = value;
    _recompute();
    _notify();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sortKey, value == SongSort.number ? 'number' : 'alphabetical');
  }

  /// Сколько песен останется, если применить [filters] (для кнопки в окне фильтров).
  int countFor(SongFilters filters) => _songs.where(filters.matches).length;

  void _recompute() {
    favoriteCount = _songs.where((s) => s.favorite).length;
    final filtered = _filters.apply(_songs);
    _filteredCount = filtered.length;
    if (searching) {
      _hits = [
        for (final h in _index.search(_query))
          if (_filters.matches(current(h.song))) h,
      ];
      _groups = const [];
      _flat = const [];
      return;
    }
    _hits = const [];
    final sorted = sortSongs(filtered, _sort);
    if (_sort == SongSort.number) {
      _flat = sorted;
      _groups = const [];
    } else {
      _flat = const [];
      final groups = <SongGroup>[];
      for (final s in sorted) {
        final letter = groupLetter(s.title);
        if (groups.isEmpty || groups.last.letter != letter) {
          groups.add(SongGroup(letter, []));
        }
        groups.last.songs.add(s);
      }
      // «#» (цифры) — в начало, как в телефонной книге.
      groups.sort((a, b) {
        if (a.letter == '#') return b.letter == '#' ? 0 : -1;
        if (b.letter == '#') return 1;
        return 0;
      });
      _groups = groups;
    }
  }

  // ------------------------------------------------------------ избранное

  /// Переключает сердечко сразу, при ошибке возвращает назад. Возвращает текст ошибки.
  Future<String?> toggleFavorite(Song song) async {
    if (!song.inCatalog) return null;
    final before = current(song);
    final next = !before.favorite;
    _applyFavorite(before.id, next);
    _pendingFavorites[before.id] = next;
    try {
      await source.setFavorite(before.id, next);
      unawaited(source.writeCache(_songs));
      return null;
    } catch (e) {
      _applyFavorite(before.id, !next);
      return 'Не удалось обновить избранное — проверьте соединение и попробуйте снова';
    } finally {
      _pendingFavorites.remove(before.id);
    }
  }

  void _applyFavorite(int id, bool value) {
    final old = _byId[id];
    if (old == null) return;
    final updated = old.copyWith(favorite: value);
    _songs = [for (final s in _songs) s.id == id ? updated : s];
    _byId = {..._byId, id: updated};
    _recompute();
    _notify();
  }
}
