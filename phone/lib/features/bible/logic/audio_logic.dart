import '../models/bible_models.dart';

const audioRates = <double>[0.75, 1.0, 1.25, 1.5, 2.0];
const sleepMinutes = <int>[5, 10, 15, 30];

/// Какой стих читается в момент [seconds]: последний начавшийся. null — разметки нет или время до начала.
int? verseFromTimings(List<VerseTiming> timings, double seconds) {
  if (timings.isEmpty || !seconds.isFinite || seconds < 0) return null;
  int? current;
  for (final t in timings) {
    if (!t.start.isFinite) continue;
    if (seconds >= t.start && seconds < t.end) return t.verse;
    if (seconds >= t.start) current = t.verse;
  }
  return current;
}

/// С какой секунды звучит стих; null — такого стиха в разметке нет.
double? startOfVerse(List<VerseTiming> timings, int verse) {
  for (final t in timings) {
    if (t.verse == verse) return t.start;
  }
  return null;
}

String formatAudioTime(Duration value) {
  if (value.isNegative) return '0:00';
  final m = value.inMinutes;
  final s = value.inSeconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

/// Следующая глава после [slug] [chapter]: в той же книге, а в конце книги — первая глава следующей.
({String slug, String name, int chapter})? nextChapterAfter(List<BibleBook> books, String slug, int chapter) {
  final i = books.indexWhere((b) => b.slug == slug);
  if (i < 0) return null;
  final book = books[i];
  if (chapter < book.chapters) return (slug: book.slug, name: book.name, chapter: chapter + 1);
  if (i + 1 < books.length) return (slug: books[i + 1].slug, name: books[i + 1].name, chapter: 1);
  return null;
}
