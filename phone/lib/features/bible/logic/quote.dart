import '../models/bible_models.dart';

/// Подряд идущие стихи объединяем: [16, 17, 18, 20] → «16–18, 20».
String verseRanges(Iterable<int> verses) {
  final sorted = verses.toSet().toList()..sort();
  if (sorted.isEmpty) return '';
  final parts = <String>[];
  var start = sorted.first;
  var prev = start;
  void flush() => parts.add(start == prev ? '$start' : '$start–$prev');
  for (final v in sorted.skip(1)) {
    if (v == prev + 1) {
      prev = v;
      continue;
    }
    flush();
    start = v;
    prev = v;
  }
  flush();
  return parts.join(', ');
}

/// Текст для буфера обмена: один стих — в кавычках со ссылкой, несколько — с номерами.
String formatQuote({
  required String bookShortName,
  required int chapter,
  required List<Verse> verses,
}) {
  final chosen = [...verses]..sort((a, b) => a.number.compareTo(b.number));
  if (chosen.isEmpty) return '';
  final ref = '$bookShortName $chapter:${verseRanges(chosen.map((v) => v.number))}';
  if (chosen.length == 1) return '«${chosen.first.text}»\n— $ref';
  final body = chosen.map((v) => '${v.number} ${v.text}').join('\n');
  return '$body\n— $ref';
}
