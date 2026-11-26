import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/church_api.dart';
import '../../core/share_text.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../songbook/widgets/reader_palette.dart';
import 'audio/bible_audio_player.dart';
import 'bible_reader_controller.dart';
import 'bible_store.dart';
import 'data/bible_repository.dart';
import 'logic/quote.dart';
import 'models/bible_models.dart';
import 'widgets/audio_widgets.dart';
import 'widgets/bible_palette.dart';
import 'widgets/bible_sheets.dart';
import 'widgets/book_picker.dart';
import 'widgets/chapter_view.dart';

/// Читалка Библии: главы листаются свайпом через границы книг, стихи выделяются нажатием.
class BibleReaderPage extends StatefulWidget {
  const BibleReaderPage({
    super.key,
    required this.source,
    required this.books,
    required this.translations,
    required this.translation,
    required this.bookSlug,
    required this.chapter,
    this.focusVerse,
    this.onPosition,
    this.store,
    this.player,
  });

  final BibleSource source;
  final List<BibleBook> books;
  final List<BibleTranslation> translations;
  final String translation;
  final String bookSlug;
  final int chapter;
  final int? focusVerse;
  final void Function(ReadingPosition position)? onPosition;
  final BibleStore? store;

  /// Плеер озвучки; по умолчанию — общий на всё приложение (тесты подставляют свой).
  final BiblePlayer? player;

  @override
  State<BibleReaderPage> createState() => _BibleReaderPageState();
}

class _BibleReaderPageState extends State<BibleReaderPage> {
  late final BibleReaderController _c;
  late PageController _pages;
  int _pagesGeneration = 0;

  @override
  void initState() {
    super.initState();
    _c = BibleReaderController(
      source: widget.source,
      store: widget.store ?? BibleStore(),
      books: widget.books,
      translation: widget.translation,
      bookSlug: widget.bookSlug,
      chapter: widget.chapter,
      focusVerse: widget.focusVerse,
      onPosition: widget.onPosition,
      translations: widget.translations,
      audio: widget.player,
    );
    _pages = PageController(initialPage: _c.page);
    _c.init();
    // Пока читалка открыта, после конца озвученной главы листаем на следующую прямо на экране.
    _c.audio.navigator = _onAutoNext;
    _c.audio.addListener(_onAudioChanged);
    _c.addListener(_onSelectionChanged);
  }

  bool _hadSelection = false;

  /// Плашка «Закладка добавлена» и подобные не должны закрывать панель действий, когда выбирают стихи снова.
  void _onSelectionChanged() {
    final has = _c.selected.isNotEmpty;
    if (has && !_hadSelection && mounted) ScaffoldMessenger.of(context).hideCurrentSnackBar();
    _hadSelection = has;
  }

  @override
  void dispose() {
    if (_c.audio.navigator == _onAutoNext) _c.audio.navigator = null;
    _c.audio.removeListener(_onAudioChanged);
    _c.removeListener(_onSelectionChanged);
    _c.dispose();
    _pages.dispose();
    super.dispose();
  }

  /// Озвучка дошла до конца главы: открываем следующую и включаем её.
  void _onAutoNext(String slug, int chapter) {
    final page = _c.index.indexOf(slug, chapter);
    if (page == null || !mounted) return;
    _goTo(page);
    unawaited(_c.listen(pageIndex: page));
  }

  /// Сбой озвучки (нет сети, запись недоступна) показываем, а не глотаем.
  void _onAudioChanged() {
    final problem = _c.audio.problem;
    if (problem == null || !mounted) return;
    _c.audio.clearProblem();
    showMessage(context, problem);
  }

  Future<void> _openPlayer() => showBiblePlayerSheet(context, player: _c.audio, palette: _palette);

  Future<void> _bookmark() async {
    try {
      final result = await _c.toggleBookmarkSelected();
      if (mounted) showMessage(context, result == BookmarkResult.added ? 'Закладка добавлена' : 'Закладка убрана');
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось сохранить закладку — проверьте интернет.');
    }
  }

  Future<void> _share() async {
    final text = await _c.selectedQuote();
    if (text.isEmpty) return;
    final ref = '${_c.current.book.shortName} ${_c.current.chapter}:${verseRanges(_c.selected)}';
    final opened = await shareText(text, title: ref);
    if (opened) {
      _c.clearSelection();
      return;
    }
    // Окно «Поделиться» недоступно — хотя бы копируем, чтобы вставить куда нужно.
    await Clipboard.setData(ClipboardData(text: text));
    _c.clearSelection();
    if (mounted) showMessage(context, 'Скопировано — можно вставить где угодно');
  }

  Future<void> _listenFromSelection() async {
    final first = (_c.selected.toList()..sort()).first;
    _c.clearSelection();
    final ok = await _c.listen(fromVerse: first);
    if (!ok && mounted) showMessage(context, 'Для этой главы нет озвучки');
  }

  bool get _reduceMotion => MediaQuery.disableAnimationsOf(context);

  void _goTo(int page, {bool animate = false}) {
    if (page < 0 || page >= _c.index.count || !_pages.hasClients) return;
    if (animate && !_reduceMotion) {
      _pages.animateToPage(page, duration: Motion.normal, curve: Curves.easeOut);
    } else {
      _pages.jumpToPage(page);
    }
  }

  ReaderPalette get _palette => biblePaletteFor(_c.settings.theme, Theme.of(context).brightness);

  Future<void> _pickPlace() async {
    final spot = await showBiblePicker(
      context,
      books: _c.index.books,
      colors: PickerColors.fromReader(_palette),
      currentSlug: _c.current.book.slug,
      currentChapter: _c.current.chapter,
    );
    if (spot == null || !mounted) return;
    final page = _c.index.indexOf(spot.book.slug, spot.chapter);
    if (page != null) _goTo(page);
  }

  Future<void> _pickTranslation() async {
    final picked = await showTranslationPicker(context, translations: widget.translations, current: _c.translation, palette: _palette);
    if (picked == null || picked.code == _c.translation || !mounted) return;
    try {
      await _c.switchTranslation(picked);
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось сменить перевод — проверьте интернет.');
      return;
    }
    if (!mounted) return;
    // Лента глав у перевода другая (например, только Новый Завет): начинаем её заново.
    final old = _pages;
    setState(() {
      _pagesGeneration++;
      _pages = PageController(initialPage: _c.page);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
  }

  Future<void> _copy() async {
    final text = await _c.selectedQuote();
    if (text.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: text));
    _c.clearSelection();
    if (mounted) showMessage(context, 'Скопировано');
  }

  Future<void> _newNote() async {
    if (_c.selected.isEmpty) return;
    final reference = '${_c.current.book.shortName} ${_c.current.chapter}:${verseRanges(_c.selected)}';
    final quote = await _c.selectedQuote();
    if (!mounted) return;
    await showNoteEditor(
      context,
      palette: _palette,
      reference: reference,
      quote: quote.split('\n— ').first,
      onSave: (body) async {
        await _c.addNote(body);
      },
    );
  }

  Future<void> _openNote(BibleNote note) async {
    await showNoteEditor(
      context,
      palette: _palette,
      reference: note.reference,
      existing: note,
      onSave: (body) => _c.editNote(note, body),
      onDelete: () => _c.removeNote(note),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final p = _palette;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: p.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
          child: PopScope(
            canPop: _c.selected.isEmpty,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) _c.clearSelection();
            },
            child: Scaffold(
              backgroundColor: p.bg,
              body: Column(
                children: [
                  _Header(controller: _c, palette: p, translations: widget.translations, onPlace: _pickPlace, onTranslation: _pickTranslation),
                  Expanded(
                    child: Stack(
                      children: [
                        PageView.builder(
                          key: ValueKey(_pagesGeneration),
                          controller: _pages,
                          itemCount: _c.index.count,
                          onPageChanged: _c.onPageChanged,
                          itemBuilder: (context, i) => _ChapterPage(controller: _c, page: i, palette: p, onNote: _openNote, onOpenPlayer: _openPlayer),
                        ),
                        Positioned(
                          left: 12,
                          right: 12,
                          bottom: 10 + MediaQuery.paddingOf(context).bottom,
                          child: ListenableBuilder(
                            listenable: _c.audio,
                            builder: (context, _) => Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (_c.audio.isActive && _c.selected.isEmpty)
                                  Padding(padding: const EdgeInsets.only(bottom: 8), child: BibleMiniPlayer(player: _c.audio, palette: p, onOpen: _openPlayer)),
                                AnimatedSwitcher(
                                  duration: Motion.fast,
                                  child: _c.selected.isEmpty
                                      ? _NavBar(controller: _c, palette: p, onPrev: () => _goTo(_c.page - 1, animate: true), onNext: () => _goTo(_c.page + 1, animate: true), onPlace: _pickPlace)
                                      : _SelectionBar(
                                          controller: _c,
                                          palette: p,
                                          onCopy: _copy,
                                          onNote: _newNote,
                                          onBookmark: _bookmark,
                                          onShare: _share,
                                          onListen: _c.hasAudioAt(_c.page) ? _listenFromSelection : null,
                                        ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller, required this.palette, required this.translations, required this.onPlace, required this.onTranslation});

  final BibleReaderController controller;
  final ReaderPalette palette;
  final List<BibleTranslation> translations;
  final VoidCallback onPlace;
  final VoidCallback onTranslation;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final translation = translations.firstWhere((t) => t.code == c.translation, orElse: () => BibleTranslation.synodal);
    return Container(
      decoration: BoxDecoration(color: palette.bg, border: Border(bottom: BorderSide(color: palette.border))),
      padding: EdgeInsets.fromLTRB(12, MediaQuery.paddingOf(context).top + 6, 12, 8),
      child: Row(
        children: [
          _IconBox(icon: Icons.chevron_left_rounded, label: 'Назад', palette: palette, onTap: () => Navigator.of(context).maybePop()),
          const SizedBox(width: 10),
          Expanded(
            child: Semantics(
              button: true,
              label: 'Выбрать книгу и главу. Сейчас ${c.title}',
              excludeSemantics: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: onPlace,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44),
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          c.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.19, height: 1.15, color: palette.text),
                        ),
                      ),
                      Icon(Icons.expand_more_rounded, color: palette.muted),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (translations.where((t) => t.hasText).length > 1) ...[
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'Перевод: ${translation.title}',
              excludeSemantics: true,
              child: Material(
                color: palette.surface,
                borderRadius: BorderRadius.circular(12),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onTranslation,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: palette.border)),
                    // Крупный системный шрифт не должен выдавливать название перевода за край экрана.
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 76),
                      child: FittedBox(fit: BoxFit.scaleDown, child: Text(translation.shortTitle, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: palette.accent))),
                    ),
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(width: 8),
          _IconBox(icon: Icons.text_fields_rounded, label: 'Настройки чтения', palette: palette, onTap: () => showBibleSettings(context, c)),
        ],
      ),
    );
  }
}

class _IconBox extends StatelessWidget {
  const _IconBox({required this.icon, required this.label, required this.palette, required this.onTap});

  final IconData icon;
  final String label;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: Material(
            color: palette.surface,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: palette.border)),
                child: Icon(icon, size: 22, color: palette.text),
              ),
            ),
          ),
        ),
      );
}

/// Одна страница ленты: загрузка, ошибка с «Повторить» или текст главы.
class _ChapterPage extends StatelessWidget {
  const _ChapterPage({required this.controller, required this.page, required this.palette, required this.onNote, required this.onOpenPlayer});

  final BibleReaderController controller;
  final int page;
  final ReaderPalette palette;
  final ValueChanged<BibleNote> onNote;
  final VoidCallback onOpenPlayer;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final entry = c.index.at(page);
    return FutureBuilder<ChapterText>(
      future: c.chapterAt(page),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return Center(child: CircularProgressIndicator(strokeWidth: 2.6, color: palette.accent));
        }
        if (snapshot.hasError) {
          return _ChapterError(
            palette: palette,
            title: '${entry.book.name} ${entry.chapter}',
            message: _message(snapshot.error!),
            onRetry: () => c.retry(page),
          );
        }
        final isCurrent = page == c.page;
        // Читаемый стих меняется часто — перерисовывается только текст, а не вся читалка.
        return ValueListenableBuilder<int?>(
          valueListenable: c.audio.activeVerse,
          builder: (context, active, _) => ChapterView(
            text: snapshot.requireData,
            bookName: entry.book.name,
            palette: palette,
            settings: c.settings,
            selected: isCurrent ? c.selected : const {},
            highlighted: c.highlightsAt(page),
            notes: c.notesAt(page),
            bookmarked: c.bookmarkedVersesAt(page),
            commentaries: c.commentariesAt(page),
            activeVerse: c.isPlayingPage(page) ? active : null,
            focusVerse: isCurrent ? c.focusVerse : null,
            bottomPadding: c.audio.isActive ? 190 : 110,
            listen: ChapterListenRow(controller: c, pageIndex: page, palette: palette, onOpenPlayer: onOpenPlayer),
            onVerseTap: c.toggleVerse,
            onNoteTap: onNote,
          ),
        );
      },
    );
  }

  static String _message(Object error) {
    final text = describeDio(error);
    return text.isEmpty ? 'Проверьте интернет и попробуйте снова. Главы, которые вы уже читали, открываются без сети.' : text;
  }
}

class _ChapterError extends StatelessWidget {
  const _ChapterError({required this.palette, required this.title, required this.message, required this.onRetry});

  final ReaderPalette palette;
  final String title;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.wifi_off_rounded, size: 40, color: palette.muted),
              const SizedBox(height: 14),
              Text('Не удалось открыть $title', textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.text)),
              const SizedBox(height: 6),
              Text(message, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, height: 1.45, color: palette.muted)),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  backgroundColor: palette.accent,
                  foregroundColor: palette.onAccent,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ],
          ),
        ),
      );
}

class _Bar extends StatelessWidget {
  const _Bar({super.key, required this.palette, required this.child});
  final ReaderPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: palette.sheet,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: palette.border),
          boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 6))],
        ),
        child: child,
      );
}

/// Предыдущая / следующая глава кнопками: свайп не должен быть единственным способом.
class _NavBar extends StatelessWidget {
  const _NavBar({required this.controller, required this.palette, required this.onPrev, required this.onNext, required this.onPlace});

  final BibleReaderController controller;
  final ReaderPalette palette;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onPlace;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final book = c.current.book;
    return _Bar(
      key: const ValueKey('nav'),
      palette: palette,
      child: Row(
        children: [
          _BarButton(icon: Icons.chevron_left_rounded, label: 'Предыдущая глава', palette: palette, onTap: c.page > 0 ? onPrev : null),
          Expanded(
            child: Semantics(
              button: true,
              label: 'Выбрать главу. Глава ${c.current.chapter} из ${book.chapters}',
              excludeSemantics: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: onPlace,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  child: Text('Глава ${c.current.chapter} из ${book.chapters}', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.secondary)),
                ),
              ),
            ),
          ),
          _BarButton(icon: Icons.chevron_right_rounded, label: 'Следующая глава', palette: palette, onTap: c.page < c.index.count - 1 ? onNext : null),
        ],
      ),
    );
  }
}

class _SelectionBar extends StatelessWidget {
  const _SelectionBar({
    required this.controller,
    required this.palette,
    required this.onCopy,
    required this.onNote,
    required this.onBookmark,
    required this.onShare,
    required this.onListen,
  });

  final BibleReaderController controller;
  final ReaderPalette palette;
  final VoidCallback onCopy;
  final VoidCallback onNote;
  final VoidCallback onBookmark;
  final VoidCallback onShare;

  /// null — для главы нет озвучки, кнопки «Слушать» не будет.
  final VoidCallback? onListen;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final marked = c.selectionAllHighlighted;
    final bookmarked = c.selectionBookmarked;
    return _Bar(
      key: const ValueKey('selection'),
      palette: palette,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _BarButton(icon: Icons.close_rounded, label: 'Снять выделение', palette: palette, onTap: c.clearSelection),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    'Стихи: ${verseRanges(c.selected)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: palette.secondary),
                  ),
                ),
              ),
              const SizedBox(width: 48),
            ],
          ),
          Row(
            children: [
              _Action(icon: bookmarked ? Icons.bookmark_remove_rounded : Icons.bookmark_add_outlined, label: bookmarked ? 'Убрать' : 'Закладка', tooltip: bookmarked ? 'Убрать закладку' : 'Закладка', palette: palette, onTap: onBookmark),
              _Action(icon: Icons.edit_note_rounded, label: 'Заметка', tooltip: 'Заметка', palette: palette, onTap: onNote, accent: true),
              if (onListen != null) _Action(icon: Icons.play_circle_outline_rounded, label: 'Слушать', tooltip: 'Слушать с этого стиха', palette: palette, onTap: onListen!),
              _Action(icon: Icons.copy_rounded, label: 'Копия', tooltip: 'Копировать', palette: palette, onTap: onCopy),
              _Action(icon: marked ? Icons.highlight_off_rounded : Icons.format_color_fill_rounded, label: marked ? 'Снять' : 'Цвет', tooltip: marked ? 'Снять подсветку' : 'Подсветить', palette: palette, onTap: c.toggleHighlightSelected),
              _Action(icon: Icons.ios_share_rounded, label: 'Отправить', tooltip: 'Поделиться', palette: palette, onTap: onShare),
            ],
          ),
        ],
      ),
    );
  }
}

/// Действие над выбранными стихами: значок и короткая подпись, чтобы не угадывать по картинке.
class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.tooltip, required this.palette, required this.onTap, this.accent = false});

  final IconData icon;
  final String label;
  final String tooltip;
  final ReaderPalette palette;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Tooltip(
          message: tooltip,
          child: Semantics(
            button: true,
            label: tooltip,
            excludeSemantics: true,
            child: Material(
              color: accent ? palette.accent : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 54),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(icon, size: 23, color: accent ? palette.onAccent : palette.text),
                      const SizedBox(height: 2),
                      Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: accent ? palette.onAccent : palette.muted)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.icon, required this.label, required this.palette, required this.onTap});

  final IconData icon;
  final String label;
  final ReaderPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Semantics(
          button: true,
          enabled: onTap != null,
          label: label,
          excludeSemantics: true,
          child: Opacity(
            opacity: onTap == null ? 0.35 : 1,
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onTap,
                child: SizedBox(width: 48, height: 48, child: Icon(icon, size: 24, color: palette.text)),
              ),
            ),
          ),
        ),
      );
}
