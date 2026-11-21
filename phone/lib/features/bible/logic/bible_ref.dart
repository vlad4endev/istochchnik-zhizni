import '../data/book_catalog.dart';

/// Ссылка на место в Писании: «Ин 3:16», «1 Кор 13:4-7», «Пс 22».
class BibleRef {
  const BibleRef(this.book, this.chapter, {this.verseStart, this.verseEnd});

  final BookDef book;
  final int chapter;
  final int? verseStart;
  final int? verseEnd;

  /// «Ин 3:16» или «Ин 3:16–18», без стихов — «Ин 3».
  String get label {
    final base = '${book.shortName} $chapter';
    if (verseStart == null) return base;
    if (verseEnd == null || verseEnd == verseStart) return '$base:$verseStart';
    return '$base:$verseStart–$verseEnd';
  }
}

/// Как пишут названия: без регистра, ё как е, без точек и пробелов («1 Кор.» == «1кор»).
String normalizeBookName(String raw) =>
    raw.toLowerCase().replaceAll('ё', 'е').replaceAll(RegExp('[. \\s]+'), '');

final Map<String, BookDef> _byAlias = () {
  final map = <String, BookDef>{};
  for (final book in bibleBooks) {
    for (final name in [book.slug, book.shortName, book.name, ...book.aliases]) {
      map.putIfAbsent(normalizeBookName(name), () => book);
    }
  }
  return map;
}();

BookDef? findBook(String raw) => _byAlias[normalizeBookName(raw)];

BookDef? bookBySlug(String slug) {
  for (final book in bibleBooks) {
    if (book.slug == slug) return book;
  }
  return null;
}

final _refPattern = RegExp(
  r'^((?:\d\s*)?[A-Za-zА-Яа-яЁё.]+(?:\s+[A-Za-zА-Яа-яЁё.]+)?)\s*(\d{1,3})'
  r'(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$',
  unicode: true,
);

/// Разбирает ссылку без обращения к серверу, поэтому работает и без сети.
BibleRef? parseBibleRef(String raw) {
  final text = raw.replaceAll(' ', ' ').trim();
  if (text.isEmpty) return null;
  final match = _refPattern.firstMatch(text);
  if (match == null) return null;
  final book = findBook(match.group(1)!);
  if (book == null) return null;
  final chapter = int.parse(match.group(2)!);
  if (chapter < 1 || chapter > book.chapters) return null;
  final start = match.group(3) == null ? null : int.parse(match.group(3)!);
  final end = match.group(4) == null ? null : int.parse(match.group(4)!);
  if (start != null && start < 1) return null;
  if (end != null && end < (start ?? 1)) return null;
  return BibleRef(book, chapter, verseStart: start, verseEnd: end);
}

/// Книги, названия которых начинаются с набранного: «иоан» → От Иоанна, 1–3 Иоанна.
/// Короткие запросы из одной буквы не считаем — это почти всегда начало слова из текста.
List<BookDef> booksByPrefix(String raw) {
  final q = normalizeBookName(raw);
  if (q.length < 2) return const [];
  final found = <BookDef>[];
  for (final book in bibleBooks) {
    final names = [book.shortName, book.name, ...book.aliases].map(normalizeBookName);
    // «иоан» находит и «1 Иоанна»: цифру в начале названия не считаем.
    final withoutDigit = names.map((n) => n.replaceFirst(RegExp(r'^\d+'), ''));
    if ([...names, ...withoutDigit].any((name) => name.startsWith(q))) found.add(book);
  }
  return found;
}

/// Что именно ввёл человек в строку поиска.
enum BibleQueryKind { empty, reference, badChapter, books, text }

class BibleQuery {
  const BibleQuery._(this.kind, this.raw, {this.ref, this.books = const []});

  final BibleQueryKind kind;
  final String raw;
  final BibleRef? ref;
  final List<BookDef> books;

  factory BibleQuery.parse(String input) {
    final raw = input.trim();
    if (raw.isEmpty) return BibleQuery._(BibleQueryKind.empty, raw);
    final ref = parseBibleRef(raw);
    if (ref != null) return BibleQuery._(BibleQueryKind.reference, raw, ref: ref);
    // Книга названа верно, а главы такой нет («Лев 99»): подсказываем, сколько глав в книге.
    final loose = _refPattern.firstMatch(raw.replaceAll('\u00a0', ' '));
    final looseBook = loose == null ? null : findBook(loose.group(1)!);
    if (looseBook != null) return BibleQuery._(BibleQueryKind.badChapter, raw, books: [looseBook]);
    final books = booksByPrefix(raw);
    // Одно слово, похожее на название книги, — это книга. Остальное ищем в тексте.
    if (books.isNotEmpty && !raw.contains(' ')) return BibleQuery._(BibleQueryKind.books, raw, books: books);
    if (findBook(raw) case final book?) return BibleQuery._(BibleQueryKind.books, raw, books: [book]);
    return BibleQuery._(BibleQueryKind.text, raw);
  }
}
