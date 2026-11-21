import 'package:material_ui/material_ui.dart';

import '../models/bible_models.dart';
import 'bible_palette.dart';

typedef BibleSpot = ({BibleBook book, int chapter});

/// Книги плитками: Ветхий и Новый Завет — две вкладки, чтобы не листать 66 строк.
class BookGrid extends StatelessWidget {
  const BookGrid({super.key, required this.books, required this.colors, required this.onPick, this.currentSlug});

  final List<BibleBook> books;
  final PickerColors colors;
  final ValueChanged<BibleBook> onPick;
  final String? currentSlug;

  @override
  Widget build(BuildContext context) {
    final ot = [for (final b in books) if (!b.isNewTestament) b];
    final nt = [for (final b in books) if (b.isNewTestament) b];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (nt.isNotEmpty) _Section(title: 'Новый Завет', books: nt, colors: colors, onPick: onPick, currentSlug: currentSlug, tint: colors.newTestament),
        if (nt.isNotEmpty && ot.isNotEmpty) const SizedBox(height: 18),
        if (ot.isNotEmpty) _Section(title: 'Ветхий Завет', books: ot, colors: colors, onPick: onPick, currentSlug: currentSlug, tint: colors.oldTestament),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.books, required this.colors, required this.onPick, required this.currentSlug, required this.tint});

  final String title;
  final List<BibleBook> books;
  final PickerColors colors;
  final ValueChanged<BibleBook> onPick;
  final String? currentSlug;
  final Color tint;

  static const _gap = 8.0;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
          child: Semantics(
            header: true,
            child: Text(
              title.toUpperCase(),
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: tint),
            ),
          ),
        ),
        LayoutBuilder(builder: (context, box) {
          final columns = (box.maxWidth / 84).floor().clamp(3, 6);
          final width = (box.maxWidth - _gap * (columns - 1)) / columns;
          return Wrap(
            spacing: _gap,
            runSpacing: _gap,
            children: [
              for (final book in books)
                SizedBox(
                  width: width,
                  child: _Tile(
                    label: book.shortName,
                    semantics: book.name,
                    selected: book.slug == currentSlug,
                    colors: colors,
                    onTap: () => onPick(book),
                  ),
                ),
            ],
          );
        }),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.semantics, required this.selected, required this.colors, required this.onTap, this.minHeight = 48});

  final String label;
  final String semantics;
  final bool selected;
  final PickerColors colors;
  final VoidCallback onTap;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: semantics,
      excludeSemantics: true,
      child: Material(
        color: selected ? colors.accent : colors.tile,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: BoxConstraints(minHeight: minHeight),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
            alignment: Alignment.center,
            decoration: selected ? null : BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: colors.border)),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                maxLines: 1,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: selected ? colors.onAccent : colors.text),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Номера глав. Текущая выделена.
class ChapterGrid extends StatelessWidget {
  const ChapterGrid({super.key, required this.book, required this.colors, required this.onPick, this.currentChapter});

  final BibleBook book;
  final PickerColors colors;
  final ValueChanged<int> onPick;
  final int? currentChapter;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      const gap = 8.0;
      final columns = (box.maxWidth / 64).floor().clamp(4, 8);
      final width = (box.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (var n = 1; n <= book.chapters; n++)
            SizedBox(
              width: width,
              child: _Tile(
                label: '$n',
                semantics: 'Глава $n',
                selected: n == currentChapter,
                colors: colors,
                minHeight: 52,
                onTap: () => onPick(n),
              ),
            ),
        ],
      );
    });
  }
}

/// Выбор места: сначала книга, потом глава. Если у книги одна глава, лист закрывается сразу.
/// [initialBook] открывает сразу выбор главы (когда книгу уже выбрали на экране).
Future<BibleSpot?> showBiblePicker(
  BuildContext context, {
  required List<BibleBook> books,
  required PickerColors colors,
  BibleBook? initialBook,
  String? currentSlug,
  int? currentChapter,
}) {
  if (initialBook != null && initialBook.chapters == 1) {
    return Future.value((book: initialBook, chapter: 1));
  }
  return showModalBottomSheet<BibleSpot>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    builder: (_) => _PickerSheet(
      books: books,
      colors: colors,
      initialBook: initialBook,
      currentSlug: currentSlug,
      currentChapter: currentChapter,
    ),
  );
}

class _PickerSheet extends StatefulWidget {
  const _PickerSheet({required this.books, required this.colors, this.initialBook, this.currentSlug, this.currentChapter});

  final List<BibleBook> books;
  final PickerColors colors;
  final BibleBook? initialBook;
  final String? currentSlug;
  final int? currentChapter;

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  BibleBook? _book;

  @override
  void initState() {
    super.initState();
    _book = widget.initialBook;
  }

  void _pickBook(BibleBook book) {
    if (book.chapters == 1) {
      Navigator.pop(context, (book: book, chapter: 1));
      return;
    }
    setState(() => _book = book);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.colors;
    final book = _book;
    final height = MediaQuery.sizeOf(context).height;
    return Container(
      constraints: BoxConstraints(maxHeight: height * 0.9),
      decoration: BoxDecoration(
        color: c.sheet,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
              child: Row(
                children: [
                  if (book != null && widget.initialBook == null)
                    IconButton(
                      tooltip: 'К списку книг',
                      onPressed: () => setState(() => _book = null),
                      icon: Icon(Icons.arrow_back_rounded, color: c.muted),
                    )
                  else
                    const SizedBox(width: 12),
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        book == null ? 'Книга' : '${book.name} — глава',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c.text),
                      ),
                    ),
                  ),
                  IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: Icon(Icons.close_rounded, color: c.muted)),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                child: book == null
                    ? BookGrid(books: widget.books, colors: c, onPick: _pickBook, currentSlug: widget.currentSlug)
                    : ChapterGrid(
                        book: book,
                        colors: c,
                        currentChapter: book.slug == widget.currentSlug ? widget.currentChapter : null,
                        onPick: (n) => Navigator.pop(context, (book: book, chapter: n)),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
