import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/widgets.dart';
import 'bible_reader_page.dart';
import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/bible_ref.dart';

/// Открывает читалку Библии на нужном месте из любого раздела (например, из программы служения).
/// Перевод берётся тот, что человек читает; если в нём нет такой книги, — синодальный.
Future<void> openBibleAt(BuildContext context, BibleRef ref) async {
  final source = BibleRepository(context.read<SessionController>());
  final store = BibleStore();
  try {
    final translations = await source.translations();
    var code = await store.translation();
    var books = await source.books(code);
    if (!books.any((b) => b.slug == ref.book.slug)) {
      code = 'synodal';
      books = await source.books(code);
    }
    if (!context.mounted) return;
    await pushPage(
      context,
      BibleReaderPage(
        source: source,
        store: store,
        books: books,
        translations: translations,
        translation: code,
        bookSlug: ref.book.slug,
        chapter: ref.chapter,
        focusVerse: ref.verseStart,
        onPosition: (p) => store.remember(p),
      ),
    );
  } catch (_) {
    if (context.mounted) showMessage(context, 'Не удалось открыть Библию — проверьте интернет.');
  }
}

/// «Ин 3:16-21; Рим 5:8» → первое место. Если разобрать нельзя — null.
BibleRef? firstBibleRef(String text) {
  for (final part in text.split(RegExp('[;]'))) {
    final ref = parseBibleRef(part.trim());
    if (ref != null) return ref;
  }
  return parseBibleRef(text.trim());
}
