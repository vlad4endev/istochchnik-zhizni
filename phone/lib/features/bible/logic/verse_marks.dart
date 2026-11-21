import '../../songbook/logic/song_search.dart';

/// Где в стихе встречаются слова запроса — для подсветки в результатах поиска.
/// Слова из одной буквы не подсвечиваем: они совпадают почти везде.
List<MatchRange> verseMarks(String text, String query) {
  final tokens = queryTokens(query).where((t) => t.length >= 2).toList();
  if (tokens.isEmpty) return const [];
  final folded = foldForSearch(text);
  final found = <MatchRange>[];
  for (final token in tokens) {
    var from = 0;
    while (true) {
      final i = folded.indexOf(token, from);
      if (i < 0) break;
      found.add(MatchRange(i, i + token.length));
      from = i + token.length;
    }
  }
  found.sort((a, b) => a.start.compareTo(b.start));
  // Пересекающиеся куски сливаем, иначе подсветка «рвётся».
  final merged = <MatchRange>[];
  for (final r in found) {
    if (merged.isNotEmpty && r.start <= merged.last.end) {
      final last = merged.removeLast();
      merged.add(MatchRange(last.start, r.end > last.end ? r.end : last.end));
    } else {
      merged.add(r);
    }
  }
  return merged;
}
