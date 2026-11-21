import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/plural.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../songbook/widgets/song_row.dart' show highlighted;
import 'bible_controller.dart';
import 'bible_reader_page.dart';
import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/bible_ref.dart';
import 'logic/verse_marks.dart';
import 'models/bible_models.dart';
import 'notes_page.dart';
import 'widgets/bible_palette.dart';
import 'widgets/bible_sheets.dart';
import 'widgets/book_picker.dart';

/// Раздел «Библия»: поиск по ссылке и по словам, «продолжить чтение», книги по заветам.
class BiblePage extends StatefulWidget {
  const BiblePage({super.key, this.source});

  /// Для тестов; в приложении источник создаётся из сессии.
  final BibleSource? source;

  @override
  State<BiblePage> createState() => _BiblePageState();
}

class _BiblePageState extends State<BiblePage> {
  late final BibleSource _source;
  late final BibleController _c;
  final _search = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _source = widget.source ?? BibleRepository(context.read<SessionController>());
    _c = BibleController(_source)..load();
  }

  @override
  void dispose() {
    _c.dispose();
    _search.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _open(String slug, int chapter, {int? verse, String? translation}) {
    _focus.unfocus();
    final code = translation ?? _c.translationCode;
    pushPage(
      context,
      BibleReaderPage(
        source: _source,
        books: _c.books,
        translations: _c.translations,
        translation: code,
        bookSlug: slug,
        chapter: chapter,
        focusVerse: verse,
        onPosition: _c.remember,
      ),
    );
  }

  Future<void> _pickBook(BibleBook book) async {
    final spot = await showBiblePicker(
      context,
      books: _c.books,
      colors: PickerColors.fromChurch(context.palette),
      initialBook: book,
    );
    if (spot != null && mounted) _open(spot.book.slug, spot.chapter);
  }

  Future<void> _pickTranslation() async {
    final palette = biblePaletteFor(BibleTheme.auto, Theme.of(context).brightness);
    final picked = await showTranslationPicker(context, translations: _c.translations, current: _c.translationCode, palette: palette);
    if (picked != null) await _c.setTranslation(picked.code);
  }

  void _openNotes() {
    pushPage(
      context,
      BibleNotesPage(
        load: () => _source.notes(),
        onOpen: (note) => _open(note.bookSlug, note.chapter, verse: note.verseStart, translation: note.translation),
      ),
    );
  }

  void _clearSearch() {
    _search.clear();
    _c.setQuery('');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) => ChurchPage(
        title: 'Библия',
        subtitle: _c.translation.title,
        actions: [
          HeaderButton(icon: Icons.sticky_note_2_outlined, tooltip: 'Мои заметки', onPressed: _openNotes),
        ],
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 0),
              child: _SearchField(controller: _search, focus: _focus, onChanged: _c.setQuery),
            ),
            Expanded(child: _content()),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    if (_c.loading && _c.books.isEmpty) return const LoadingView();
    if (_c.books.isEmpty) return ErrorView(message: _c.error ?? 'Список книг пуст', onRetry: _c.load);
    switch (_c.query.kind) {
      case BibleQueryKind.empty:
        return _home();
      case BibleQueryKind.reference:
        return _reference();
      case BibleQueryKind.badChapter:
        return _badChapter();
      case BibleQueryKind.books:
        return _bookMatches();
      case BibleQueryKind.text:
        return _textResults();
    }
  }

  // ——— главная ———

  Widget _home() {
    final palette = context.palette;
    final position = _c.position;
    final recent = _c.recent.where((p) => !(position != null && p.bookSlug == position.bookSlug && p.chapter == position.chapter)).toList();
    return SheetList(
      gap: Space.lg,
      children: [
        if (position != null)
          _ContinueCard(position: position, translation: _c.translation, onTap: () => _open(position.bookSlug, position.chapter, verse: position.verse > 1 ? position.verse : null, translation: position.translation))
        else
          _StartCard(onTap: () {
            final john = _c.bookBySlugInList('john');
            if (john != null) _open('john', 1);
          }, available: _c.bookBySlugInList('john') != null),
        if (recent.isNotEmpty)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionLabel('Недавно читали'),
              const SizedBox(height: Space.sm),
              SizedBox(
                height: 48,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: recent.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => _RecentChip(position: recent[i], onTap: () => _open(recent[i].bookSlug, recent[i].chapter, translation: recent[i].translation)),
                ),
              ),
            ],
          ),
        if (_c.translations.where((t) => t.hasText).length > 1) _TranslationRow(translation: _c.translation, onTap: _pickTranslation),
        BookGrid(books: _c.books, colors: PickerColors.fromChurch(palette), onPick: _pickBook, currentSlug: position?.bookSlug),
      ],
    );
  }

  // ——— поиск ———

  Widget _reference() {
    final ref = _c.query.ref!;
    final book = _c.bookBySlugInList(ref.book.slug);
    final palette = context.palette;
    if (book == null) {
      return EmptyHint(
        'В переводе «${_c.translation.shortTitle}» нет книги «${ref.book.name}»',
        icon: Icons.menu_book_outlined,
        hint: 'Выберите другой перевод — например, синодальный.',
        action: SecondaryButton(label: 'Сменить перевод', icon: Icons.translate_rounded, onPressed: _pickTranslation, expand: false),
      );
    }
    return SheetList(
      children: [
        ChurchCard(
          padding: EdgeInsets.zero,
          child: ListRow(
            leading: const IconTile(Icons.auto_stories_outlined, tone: Tone.wine),
            title: 'Открыть ${ref.label}',
            subtitle: ref.verseStart == null ? ref.book.name : '${ref.book.name} · сразу к стиху',
            onTap: () => _open(ref.book.slug, ref.chapter, verse: ref.verseStart),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text('Можно писать и так: «Ин 3:16», «1 Кор 13», «Пс 22».', style: TextStyle(fontSize: 12.5, height: 1.4, color: palette.inkMuted)),
        ),
      ],
    );
  }

  Widget _badChapter() {
    final def = _c.query.books.first;
    final book = _c.bookBySlugInList(def.slug);
    if (book == null) {
      return EmptyHint('В этом переводе нет книги «${def.name}»', icon: Icons.menu_book_outlined, hint: 'Выберите другой перевод — например, синодальный.');
    }
    return EmptyHint(
      '${book.name}: ${book.chapters} ${pluralRu(book.chapters, 'глава', 'главы', 'глав')}',
      icon: Icons.menu_book_outlined,
      hint: 'Такой главы нет. Выберите из списка или поправьте номер.',
      action: PrimaryButton(label: 'Выбрать главу', icon: Icons.grid_view_rounded, height: 48, expand: false, onPressed: () => _pickBook(book)),
    );
  }

  Widget _bookMatches() {
    final books = [for (final def in _c.query.books) ?_c.bookBySlugInList(def.slug)];
    if (books.isEmpty) {
      return EmptyHint('В этом переводе нет такой книги', icon: Icons.menu_book_outlined, hint: 'Попробуйте другой перевод или поиск по словам.');
    }
    return SheetList(
      children: [
        ListGroup(
          children: [
            for (final book in books)
              ListRow(
                leading: _BookBadge(label: book.shortName, newTestament: book.isNewTestament),
                title: book.name,
                subtitle: '${book.chapters} ${pluralRu(book.chapters, 'глава', 'главы', 'глав')} · ${book.isNewTestament ? 'Новый Завет' : 'Ветхий Завет'}',
                onTap: () => _pickBook(book),
              ),
          ],
        ),
      ],
    );
  }

  Widget _textResults() {
    final palette = context.palette;
    if (_c.query.raw.length < 2) {
      return const EmptyHint('Введите хотя бы два символа', icon: Icons.search_rounded, hint: 'Ищем слова во всех стихах выбранного перевода.');
    }
    if (_c.searching && _c.hits.isEmpty) return const LoadingView();
    if (_c.searchError != null) {
      return EmptyHint(
        'Поиск по тексту недоступен',
        icon: Icons.wifi_off_rounded,
        hint: _c.searchError,
        action: SecondaryButton(label: 'Повторить', icon: Icons.refresh_rounded, onPressed: () => _c.setQuery(_c.query.raw), expand: false),
      );
    }
    if (_c.hits.isEmpty) {
      return EmptyHint(
        'Ничего не найдено',
        icon: Icons.search_off_rounded,
        hint: 'Проверьте написание или попробуйте другое слово. Ссылки пишите так: «Ин 3:16».',
        action: SecondaryButton(label: 'Сбросить поиск', icon: Icons.close_rounded, onPressed: _clearSearch, expand: false),
      );
    }
    final markBg = palette.isDark ? const Color(0x66E8B35F) : const Color(0x66FFD166);
    final query = _c.query.raw;
    return SheetList(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text(
            _c.hits.length >= 40 ? 'Показаны первые ${_c.hits.length} стихов — уточните запрос' : 'Найдено: ${_c.hits.length} ${pluralRu(_c.hits.length, 'стих', 'стиха', 'стихов')}',
            style: TextStyle(fontSize: 12.5, color: palette.inkMuted),
          ),
        ),
        ListGroup(
          dividerIndent: 14,
          children: [
            for (final hit in _c.hits)
              ListRow(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                title: hit.reference,
                titleColor: palette.accent,
                subtitleMaxLines: 3,
                subtitleWidget: highlighted(
                  hit.text,
                  verseMarks(hit.text, query),
                  TextStyle(fontSize: 14.5, height: 1.4, color: palette.ink),
                  markBg,
                  maxLines: 3,
                ),
                onTap: () => _open(hit.bookSlug, hit.chapter, verse: hit.verse),
              ),
          ],
        ),
      ],
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.focus, required this.onChanged});

  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) => TextField(
        controller: controller,
        focusNode: focus,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => focus.unfocus(),
        enableSuggestions: false,
        style: TextStyle(fontSize: 15.5, color: palette.ink),
        decoration: InputDecoration(
          hintText: 'Ссылка или слова: Ин 3:16, любовь…',
          prefixIcon: Icon(Icons.search_rounded, color: palette.inkMuted),
          suffixIcon: value.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Очистить поиск',
                  icon: Icon(Icons.close_rounded, color: palette.inkMuted),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
        ),
      ),
    );
  }
}

/// Крупная карточка «Продолжить чтение»: главное действие экрана.
class _ContinueCard extends StatelessWidget {
  const _ContinueCard({required this.position, required this.translation, required this.onTap});

  final ReadingPosition position;
  final BibleTranslation translation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bookName = position.book?.name ?? position.bookSlug;
    final detail = [
      if (position.verse > 1) 'стих ${position.verse}',
      translation.shortTitle,
    ].join(' · ');
    return Semantics(
      button: true,
      label: 'Продолжить чтение: $bookName ${position.chapter}. $detail',
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(Radii.card),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: BoxDecoration(gradient: wineGradient, borderRadius: BorderRadius.circular(Radii.card)),
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('ПРОДОЛЖИТЬ ЧТЕНИЕ', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: Color(0xB8FFFFFF))),
                        const SizedBox(height: 6),
                        Text('$bookName ${position.chapter}', maxLines: 2, overflow: TextOverflow.ellipsis, style: ChurchType.serifTitle.copyWith(fontSize: 26, color: Colors.white)),
                        if (detail.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(detail, style: const TextStyle(fontSize: 13, color: Color(0xCCFFFFFF)))),
                      ],
                    ),
                  ),
                  Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(color: Color(0x26FFFFFF), shape: BoxShape.circle),
                    child: const Icon(Icons.arrow_forward_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StartCard extends StatelessWidget {
  const _StartCard({required this.onTap, required this.available});

  final VoidCallback onTap;
  final bool available;

  @override
  Widget build(BuildContext context) {
    if (!available) return const SizedBox.shrink();
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: ListRow(
        leading: const IconTile(Icons.auto_stories_outlined, tone: Tone.wine),
        title: 'Начните с Евангелия от Иоанна',
        subtitle: 'Первая глава — о Слове, ставшем плотью',
        subtitleMaxLines: 2,
        onTap: onTap,
      ),
    );
  }
}

class _RecentChip extends StatelessWidget {
  const _RecentChip({required this.position, required this.onTap});

  final ReadingPosition position;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      label: position.label,
      excludeSemantics: true,
      child: Material(
        color: palette.card,
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), border: Border.all(color: palette.outline)),
            child: Text(position.label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.ink)),
          ),
        ),
      ),
    );
  }
}

class _TranslationRow extends StatelessWidget {
  const _TranslationRow({required this.translation, required this.onTap});

  final BibleTranslation translation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: ListRow(
        leading: const IconTile(Icons.translate_rounded, tone: Tone.teal),
        title: 'Перевод',
        subtitle: translation.title,
        trailing: Text('Сменить', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: context.palette.accent)),
        onTap: onTap,
      ),
    );
  }
}

class _BookBadge extends StatelessWidget {
  const _BookBadge({required this.label, required this.newTestament});

  final String label;
  final bool newTestament;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = newTestament ? Tone.wine : Tone.amber;
    return Container(
      width: 42,
      height: 42,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: tone.bg(palette), borderRadius: BorderRadius.circular(Radii.md)),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: tone.fg(palette))),
        ),
      ),
    );
  }
}
