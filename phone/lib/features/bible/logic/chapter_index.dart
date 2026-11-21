import '../models/bible_models.dart';

/// Одна лента глав через всю Библию: пролистывание из конца книги ведёт в начало следующей.
class ChapterIndex {
  ChapterIndex(this.books) {
    var total = 0;
    for (final book in books) {
      _starts.add(total);
      total += book.chapters;
    }
    count = total;
  }

  final List<BibleBook> books;
  final List<int> _starts = [];
  late final int count;

  /// Номер страницы для книги и главы; null — такой книги в переводе нет.
  int? indexOf(String slug, int chapter) {
    for (var i = 0; i < books.length; i++) {
      if (books[i].slug != slug) continue;
      return _starts[i] + chapter.clamp(1, books[i].chapters) - 1;
    }
    return null;
  }

  ({BibleBook book, int chapter}) at(int index) {
    final i = index.clamp(0, count - 1);
    var lo = 0;
    var hi = books.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (_starts[mid] <= i) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return (book: books[lo], chapter: i - _starts[lo] + 1);
  }
}
