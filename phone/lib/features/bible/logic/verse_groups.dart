import '../models/bible_models.dart';

typedef VerseSpan = ({int start, int end});

/// Подряд идущие стихи — один диапазон: [3, 4, 5, 9] → 3–5 и 9.
List<VerseSpan> verseGroups(Iterable<int> verses) {
  final sorted = verses.toSet().toList()..sort();
  final spans = <VerseSpan>[];
  for (final v in sorted) {
    if (spans.isNotEmpty && spans.last.end + 1 == v) {
      spans[spans.length - 1] = (start: spans.last.start, end: v);
    } else {
      spans.add((start: v, end: v));
    }
  }
  return spans;
}

/// Что делает кнопка «Закладка» для выбранных стихов: если на каждый выбранный диапазон уже есть
/// точная закладка — убирает их, иначе создаёт недостающие.
({List<BibleBookmark> remove, List<VerseSpan> add}) planBookmarkToggle(Iterable<int> selected, List<BibleBookmark> existing) {
  final spans = verseGroups(selected);
  final exact = <BibleBookmark>[];
  final missing = <VerseSpan>[];
  for (final span in spans) {
    final hit = existing.where((b) => b.verseStart == span.start && b.verseEnd == span.end).firstOrNull;
    if (hit != null) {
      exact.add(hit);
    } else {
      missing.add(span);
    }
  }
  if (spans.isNotEmpty && missing.isEmpty) return (remove: exact, add: const []);
  return (remove: const [], add: missing);
}
