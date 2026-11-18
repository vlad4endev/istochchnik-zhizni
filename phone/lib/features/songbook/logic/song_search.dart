/// Поиск, фильтры и сортировка песен. Чистый Dart, работает без интернета.
library;

import '../models/song.dart';
import 'song_format.dart';

/// Диапазон символов в исходной строке (для подсветки).
class MatchRange {
  const MatchRange(this.start, this.end);
  final int start;
  final int end;
}

/// Строка для сравнения: нижний регистр, «ё»→«е», всё кроме букв и цифр — пробел.
/// Длина строки не меняется, поэтому индексы совпадают с исходным текстом.
String foldForSearch(String s) {
  final b = StringBuffer();
  for (final rune in s.runes) {
    final ch = String.fromCharCode(rune);
    final lower = ch.toLowerCase();
    final one = lower.length == ch.length ? lower : ch;
    if (one == 'ё') {
      b.write('е');
    } else if (RegExp(r'[\p{L}\p{N}]', unicode: true).hasMatch(one)) {
      b.write(one);
    } else {
      b.write(' ' * ch.length);
    }
  }
  return b.toString();
}

List<String> queryTokens(String query) =>
    foldForSearch(query).split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();

/// Короткие слова (1–2 буквы) ищем только с начала слова, иначе «о» найдёт всё подряд.
bool _prefixOnly(String token) => token.length < 3;

/// Позиция совпадения [token] в свёрнутой строке или -1.
int _find(String folded, String token, [int from = 0]) {
  var i = folded.indexOf(token, from);
  while (i >= 0) {
    if (!_prefixOnly(token) || i == 0 || folded[i - 1] == ' ') return i;
    i = folded.indexOf(token, i + 1);
  }
  return -1;
}

bool _wordStart(String folded, int i) => i == 0 || folded[i - 1] == ' ';

class Snippet {
  const Snippet(this.text, this.marks);
  final String text;
  final List<MatchRange> marks;
}

class SearchHit {
  const SearchHit(this.song, this.score, this.titleMarks, this.snippet);
  final Song song;
  final int score;
  final List<MatchRange> titleMarks;

  /// Строка из текста песни, если совпало не в названии.
  final Snippet? snippet;
}

class _Entry {
  _Entry(this.song)
      : titleF = foldForSearch(song.title),
        tagsF = [for (final t in song.visibleTags) foldForSearch(t)],
        keyL = song.keyLabel?.toLowerCase(),
        numberS = song.number?.toString(),
        lines = [for (final l in songPlainText(song.content).split('\n')) if (l.trim().isNotEmpty) l.trim()] {
    linesF = [for (final l in lines) foldForSearch(l)];
  }

  final Song song;
  final String titleF;
  final List<String> tagsF;
  final String? keyL;
  final String? numberS;
  final List<String> lines;
  late final List<String> linesF;
}

const _maxSnippet = 64;

class SongIndex {
  SongIndex(List<Song> songs) : _entries = [for (final s in songs) _Entry(s)];

  final List<_Entry> _entries;

  int get length => _entries.length;

  /// Результаты по убыванию релевантности. Пустой запрос — пустой список.
  List<SearchHit> search(String query) {
    final tokens = queryTokens(query);
    if (tokens.isEmpty) return const [];
    final rawKey = query.trim().toLowerCase();
    final hits = <SearchHit>[];
    for (final e in _entries) {
      final hit = _match(e, tokens, rawKey);
      if (hit != null) hits.add(hit);
    }
    hits.sort((a, b) {
      final byScore = b.score.compareTo(a.score);
      return byScore != 0 ? byScore : foldForSearch(a.song.title).compareTo(foldForSearch(b.song.title));
    });
    return hits;
  }

  SearchHit? _match(_Entry e, List<String> tokens, String rawKey) {
    // «Am», «F#m»: запрос целиком совпал с тональностью песни.
    if (e.keyL != null && e.keyL == rawKey) {
      return SearchHit(e.song, 50, const [], null);
    }
    var score = 0;
    final titleMarks = <MatchRange>[];
    final lyricsTokens = <String>[];
    for (final token in tokens) {
      var best = 0;
      var inLyricsOnly = false;
      if (e.numberS != null && e.numberS == token) {
        best = 100;
      } else if (e.numberS != null && RegExp(r'^\d+$').hasMatch(token) && e.numberS!.startsWith(token)) {
        best = 35;
      }
      final t = _find(e.titleF, token);
      if (t >= 0) {
        final s = t == 0 ? 70 : (_wordStart(e.titleF, t) ? 60 : 40);
        if (s > best) best = s;
        titleMarks.add(MatchRange(t, t + token.length));
      }
      for (final tag in e.tagsF) {
        final i = _find(tag, token);
        if (i >= 0) best = best < 22 ? (_wordStart(tag, i) ? 30 : 22) : best;
      }
      if (best == 0) {
        for (final line in e.linesF) {
          final i = _find(line, token);
          if (i >= 0) {
            best = _wordStart(line, i) ? 14 : 10;
            inLyricsOnly = true;
            break;
          }
        }
      }
      if (best == 0) return null;
      if (inLyricsOnly) lyricsTokens.add(token);
      score += best;
    }
    return SearchHit(e.song, score, _merge(titleMarks), lyricsTokens.isEmpty ? null : _snippet(e, lyricsTokens));
  }

  Snippet? _snippet(_Entry e, List<String> tokens) {
    var bestLine = -1;
    var bestCount = 0;
    for (var i = 0; i < e.linesF.length; i++) {
      final count = tokens.where((t) => _find(e.linesF[i], t) >= 0).length;
      if (count > bestCount) {
        bestCount = count;
        bestLine = i;
      }
    }
    if (bestLine < 0) return null;
    final line = e.lines[bestLine];
    final folded = e.linesF[bestLine];
    var marks = <MatchRange>[];
    for (final t in tokens) {
      final i = _find(folded, t);
      if (i >= 0) marks.add(MatchRange(i, i + t.length));
    }
    marks = _merge(marks);
    var start = 0;
    var end = line.length;
    var text = line;
    if (line.length > _maxSnippet && marks.isNotEmpty) {
      start = (marks.first.start - 24).clamp(0, line.length);
      end = (start + _maxSnippet).clamp(0, line.length);
      // Не рвём слова: сдвигаем границы к ближайшему пробелу.
      if (start > 0) {
        final sp = line.indexOf(' ', start);
        if (sp >= 0 && sp < marks.first.start) start = sp + 1;
      }
      if (end < line.length) {
        final sp = line.lastIndexOf(' ', end);
        if (sp > marks.last.end) end = sp;
      }
      text = '${start > 0 ? '…' : ''}${line.substring(start, end)}${end < line.length ? '…' : ''}';
    }
    final shift = (start > 0 ? 1 : 0) - start;
    final shifted = [
      for (final m in marks)
        if (m.start >= start && m.end <= end) MatchRange(m.start + shift, m.end + shift),
    ];
    return Snippet(text, shifted);
  }
}

List<MatchRange> _merge(List<MatchRange> ranges) {
  if (ranges.length < 2) return ranges;
  final sorted = [...ranges]..sort((a, b) => a.start.compareTo(b.start));
  final out = <MatchRange>[sorted.first];
  for (final r in sorted.skip(1)) {
    final last = out.last;
    if (r.start <= last.end) {
      out[out.length - 1] = MatchRange(last.start, r.end > last.end ? r.end : last.end);
    } else {
      out.add(r);
    }
  }
  return out;
}

// ---------------------------------------------------------------- фильтры и сортировка

enum TempoBand {
  slow('Медленные', 'до 75'),
  medium('Средние', '75–104'),
  fast('Быстрые', 'от 105');

  const TempoBand(this.label, this.range);
  final String label;
  final String range;

  bool contains(int bpm) => switch (this) {
        slow => bpm < 75,
        medium => bpm >= 75 && bpm < 105,
        fast => bpm >= 105,
      };
}

enum SongSort { alphabetical, number }

class SongFilters {
  const SongFilters({this.favoritesOnly = false, this.tags = const {}, this.keys = const {}, this.tempo});

  final bool favoritesOnly;
  final Set<String> tags;
  final Set<String> keys;
  final TempoBand? tempo;

  bool get isEmpty => !favoritesOnly && tags.isEmpty && keys.isEmpty && tempo == null;

  /// Сколько групп фильтров включено в окне «Фильтры» (избранное — отдельная кнопка).
  int get activeCount => (tags.isNotEmpty ? 1 : 0) + (keys.isNotEmpty ? 1 : 0) + (tempo != null ? 1 : 0);

  SongFilters copyWith({bool? favoritesOnly, Set<String>? tags, Set<String>? keys, Object? tempo = _keep}) => SongFilters(
        favoritesOnly: favoritesOnly ?? this.favoritesOnly,
        tags: tags ?? this.tags,
        keys: keys ?? this.keys,
        tempo: identical(tempo, _keep) ? this.tempo : tempo as TempoBand?,
      );

  bool matches(Song s) {
    if (favoritesOnly && !s.favorite) return false;
    if (tags.isNotEmpty && !s.visibleTags.any(tags.contains)) return false;
    if (keys.isNotEmpty && !(s.keyLabel != null && keys.contains(s.keyLabel))) return false;
    if (tempo != null && !(s.tempo != null && tempo!.contains(s.tempo!))) return false;
    return true;
  }

  List<Song> apply(List<Song> songs) => [for (final s in songs) if (matches(s)) s];
}

const _keep = Object();

String _sortKey(String title) {
  final folded = foldForSearch(title).trim();
  return folded;
}

List<Song> sortSongs(List<Song> songs, SongSort sort) {
  final copy = [...songs];
  int byTitle(Song a, Song b) {
    final c = _sortKey(a.title).compareTo(_sortKey(b.title));
    return c != 0 ? c : a.id.compareTo(b.id);
  }

  copy.sort(switch (sort) {
    SongSort.alphabetical => byTitle,
    SongSort.number => (a, b) {
        final an = a.number;
        final bn = b.number;
        if (an != null && bn != null && an != bn) return an.compareTo(bn);
        if (an == null && bn != null) return 1;
        if (an != null && bn == null) return -1;
        return byTitle(a, b);
      },
  });
  return copy;
}

/// Буква для группы в списке: «Ё» относим к «Е», цифры и знаки — к «#».
String groupLetter(String title) {
  for (final rune in title.runes) {
    final ch = String.fromCharCode(rune);
    if (!RegExp(r'[\p{L}\p{N}]', unicode: true).hasMatch(ch)) continue;
    if (!RegExp(r'\p{L}', unicode: true).hasMatch(ch)) return '#';
    final up = ch.toUpperCase();
    return up == 'Ё' ? 'Е' : up;
  }
  return '#';
}
