/// Подпись к записи сворачивается, если длинная: «ещё» раскрывает.
const captionCollapsedLines = 3;
const captionCollapseChars = 140;

/// Нужно ли сворачивать подпись (много символов или много строк).
bool captionNeedsCollapse(String text) => text.length > captionCollapseChars || '\n'.allMatches(text).length >= captionCollapsedLines;

/// «1 комментарий», «2 комментария», «5 комментариев».
String commentsWord(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  if (mod10 == 1 && mod100 != 11) return '$n комментарий';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return '$n комментария';
  return '$n комментариев';
}

/// Короткое число для счётчиков: 1200 → «1,2 тыс.».
String compactCount(int n) {
  if (n < 1000) return '$n';
  if (n < 1000000) {
    final k = n / 1000;
    return '${(k >= 10 ? k.round().toString() : k.toStringAsFixed(1)).replaceAll('.', ',').replaceAll(RegExp(r',0$'), '')} тыс.';
  }
  return '${(n / 1000000).toStringAsFixed(1).replaceAll('.', ',').replaceAll(RegExp(r',0$'), '')} млн';
}

/// Подпись «отметки нравится»: «Нравится Анне и ещё 3» — по счётчику.
String likesLabel(int n) {
  if (n <= 0) return 'Пока нет отметок';
  final mod10 = n % 10;
  final mod100 = n % 100;
  final word = (mod10 == 1 && mod100 != 11) ? 'отметка' : ((mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) ? 'отметки' : 'отметок');
  return '$n $word «нравится»';
}
