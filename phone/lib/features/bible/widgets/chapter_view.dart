import 'package:flutter/gestures.dart';
import 'package:flutter/rendering.dart';
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../songbook/widgets/reader_palette.dart';
import '../bible_store.dart';
import '../models/bible_models.dart';

/// Одна глава: заголовок, стихи (сплошным текстом или по строкам), заметки.
/// Нажатие на стих выделяет его; выделенные стихи ведут к действиям внизу экрана.
class ChapterView extends StatefulWidget {
  const ChapterView({
    super.key,
    required this.text,
    required this.bookName,
    required this.palette,
    required this.settings,
    required this.selected,
    required this.highlighted,
    required this.notes,
    required this.onVerseTap,
    required this.onNoteTap,
    this.focusVerse,
    this.bottomPadding = 110,
    this.bookmarked = const {},
    this.commentaries = const [],
    this.activeVerse,
    this.listen,
  });

  final ChapterText text;
  final String bookName;
  final ReaderPalette palette;
  final BibleSettings settings;
  final Set<int> selected;
  final Set<int> highlighted;
  final List<BibleNote> notes;
  final ValueChanged<int> onVerseTap;
  final ValueChanged<BibleNote> onNoteTap;
  final int? focusVerse;
  final double bottomPadding;

  /// Стихи с закладкой — перед номером значок.
  final Set<int> bookmarked;
  final List<BibleCommentary> commentaries;

  /// Стих, который сейчас читает озвучка: подсвечивается, текст прокручивается за ним.
  final int? activeVerse;

  /// Строка «Слушать главу» под заголовком.
  final Widget? listen;

  @override
  State<ChapterView> createState() => _ChapterViewState();
}

class _ChapterViewState extends State<ChapterView> {
  final _scroll = ScrollController();
  final _paragraphKey = GlobalKey();
  final _verseKeys = <int, GlobalKey>{};
  final _recognizers = <TapGestureRecognizer>[];
  final _verseOffsets = <int, int>{};
  bool _jumped = false;

  @override
  void initState() {
    super.initState();
    _scheduleJump();
  }

  @override
  void didUpdateWidget(ChapterView old) {
    super.didUpdateWidget(old);
    if (old.focusVerse != widget.focusVerse) {
      _jumped = false;
      _scheduleJump();
    }
    if (old.activeVerse != widget.activeVerse && widget.activeVerse != null) _followVerse(widget.activeVerse!);
  }

  /// Озвучка перешла к другому стиху: если он ушёл из поля зрения — подтягиваем текст.
  void _followVerse(int verse) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final viewport = context.findRenderObject();
      if (viewport is! RenderBox) return;
      double? y;
      if (widget.settings.verseLines) {
        final box = _verseKeys[verse]?.currentContext?.findRenderObject();
        if (box is RenderBox) y = box.localToGlobal(Offset.zero).dy;
      } else {
        final paragraph = _paragraphKey.currentContext?.findRenderObject();
        final offset = _verseOffsets[verse];
        if (paragraph is RenderParagraph && offset != null) {
          final caret = paragraph.getOffsetForCaret(TextPosition(offset: offset), Rect.zero);
          y = paragraph.localToGlobal(Offset(0, caret.dy)).dy;
        }
      }
      if (y == null) return;
      final top = viewport.localToGlobal(Offset.zero).dy;
      final bottom = top + viewport.size.height;
      // Нижняя часть закрыта панелью плеера и действий — запас больше, чем сверху.
      if (y > top + 56 && y < bottom - widget.bottomPadding - 40) return;
      final target = (_scroll.offset + (y - top) - viewport.size.height * 0.3).clamp(0.0, _scroll.position.maxScrollExtent);
      if (MediaQuery.disableAnimationsOf(context)) {
        _scroll.jumpTo(target);
      } else {
        _scroll.animateTo(target, duration: const Duration(milliseconds: 320), curve: Curves.easeOut);
      }
    });
  }

  @override
  void dispose() {
    _disposeRecognizers();
    _scroll.dispose();
    super.dispose();
  }

  void _disposeRecognizers() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  /// Открыли по ссылке «Ин 3:16» — прокручиваем к стиху, как только текст разложен.
  void _scheduleJump() {
    final verse = widget.focusVerse;
    if (verse == null || verse <= 1 || _jumped) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _jumped || !_scroll.hasClients) return;
      _jumped = true;
      if (widget.settings.verseLines) {
        final ctx = _verseKeys[verse]?.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, alignment: 0.12);
        return;
      }
      final paragraph = _paragraphKey.currentContext?.findRenderObject();
      final offset = _verseOffsets[verse];
      final viewport = context.findRenderObject();
      if (paragraph is! RenderParagraph || offset == null || viewport is! RenderBox) return;
      final caret = paragraph.getOffsetForCaret(TextPosition(offset: offset), Rect.zero);
      final top = viewport.localToGlobal(Offset.zero).dy;
      final y = paragraph.localToGlobal(Offset(0, caret.dy)).dy;
      final target = (_scroll.offset + (y - top) - 28).clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.jumpTo(target);
    });
  }

  Color get _markColor =>
      widget.palette.isDark ? const Color(0xFFFFD166).withValues(alpha: 0.2) : const Color(0xFFFFD166).withValues(alpha: 0.5);

  Color get _readColor => const Color(0xFFF2B879).withValues(alpha: widget.palette.isDark ? 0.34 : 0.55);

  Color get _selectColor => widget.palette.accent.withValues(alpha: widget.palette.isDark ? 0.3 : 0.2);

  TextStyle get _body => TextStyle(
        fontFamily: ChurchType.family,
        fontSize: widget.settings.fontSize,
        height: 1.7,
        color: widget.palette.text,
      );

  BibleNote? _noteAt(int verse) {
    for (final n in widget.notes) {
      if (n.verseStart == verse) return n;
    }
    return null;
  }

  Color? _background(int verse) {
    if (widget.selected.contains(verse)) return _selectColor;
    if (widget.activeVerse == verse) return _readColor;
    if (widget.highlighted.contains(verse)) return _markColor;
    return null;
  }

  TapGestureRecognizer _tap(VoidCallback onTap) {
    final r = TapGestureRecognizer()..onTap = onTap;
    _recognizers.add(r);
    return r;
  }

  TextSpan _numberSpan(Verse verse, Color? background, VoidCallback onTap) => TextSpan(
        text: widget.settings.showNumbers ? '${verse.number} ' : '',
        recognizer: _tap(onTap),
        style: TextStyle(
          fontSize: widget.settings.fontSize * 0.62,
          fontWeight: FontWeight.w800,
          color: widget.palette.accent,
          backgroundColor: background,
        ),
      );

  InlineSpan _bookmarkIcon(int verse) => WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: Semantics(
          label: 'Закладка у стиха $verse',
          child: Padding(
            padding: const EdgeInsets.only(right: 3),
            child: Icon(Icons.bookmark_rounded, size: widget.settings.fontSize * 0.78, color: const Color(0xFFE0A030)),
          ),
        ),
      );

  InlineSpan _noteIcon(BibleNote note) => WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: Semantics(
          button: true,
          label: 'Заметка к стиху ${note.verseStart}',
          child: GestureDetector(
            onTap: () => widget.onNoteTap(note),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Icon(Icons.sticky_note_2_outlined, size: widget.settings.fontSize * 0.8, color: widget.palette.accent),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    _disposeRecognizers();
    _verseOffsets.clear();
    final p = widget.palette;
    final verses = widget.text.verses;
    final content = widget.settings.verseLines ? _lines(verses) : _flow(verses);

    return SingleChildScrollView(
      controller: _scroll,
      padding: EdgeInsets.fromLTRB(22, 18, 22, widget.bottomPadding + MediaQuery.paddingOf(context).bottom),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(widget.bookName.toUpperCase(), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: p.muted)),
          ),
          const SizedBox(height: 4),
          Text('Глава ${widget.text.chapter}', style: ChurchType.serifTitle.copyWith(fontSize: 32, color: p.text)),
          const SizedBox(height: 18),
          if (widget.listen != null) widget.listen!,
          content,
          if (widget.commentaries.isNotEmpty) ...[
            const SizedBox(height: 28),
            Semantics(
              header: true,
              child: Text('КОММЕНТАРИИ · ${widget.commentaries.length}', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: p.muted)),
            ),
            const SizedBox(height: 10),
            for (final c in widget.commentaries) _CommentaryCard(commentary: c, palette: p),
          ],
          if (widget.notes.isNotEmpty) ...[
            const SizedBox(height: 28),
            Text('ЗАМЕТКИ К ГЛАВЕ', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: p.muted)),
            const SizedBox(height: 10),
            for (final note in widget.notes) _NoteCard(note: note, palette: p, onTap: () => widget.onNoteTap(note)),
          ],
        ],
      ),
    );
  }

  Widget _flow(List<Verse> verses) {
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final verse in verses) {
      final bg = _background(verse.number);
      final note = _noteAt(verse.number);
      _verseOffsets[verse.number] = cursor;
      if (widget.bookmarked.contains(verse.number)) {
        spans.add(_bookmarkIcon(verse.number));
        cursor += 1;
      }
      final number = _numberSpan(verse, bg, () => widget.onVerseTap(verse.number));
      spans.add(number);
      cursor += number.text!.length;
      spans.add(TextSpan(
        text: verse.text,
        recognizer: _tap(() => widget.onVerseTap(verse.number)),
        style: TextStyle(backgroundColor: bg),
      ));
      cursor += verse.text.length;
      if (note != null) {
        spans.add(_noteIcon(note));
        cursor += 1;
      }
      spans.add(const TextSpan(text: ' '));
      cursor += 1;
    }
    return Text.rich(TextSpan(children: spans), key: _paragraphKey, style: _body);
  }

  Widget _lines(List<Verse> verses) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final verse in verses)
          Padding(
            key: _verseKeys.putIfAbsent(verse.number, GlobalKey.new),
            padding: const EdgeInsets.only(bottom: 6),
            child: Text.rich(
              TextSpan(
                children: [
                  if (widget.bookmarked.contains(verse.number)) _bookmarkIcon(verse.number),
                  _numberSpan(verse, _background(verse.number), () => widget.onVerseTap(verse.number)),
                  TextSpan(
                    text: verse.text,
                    recognizer: _tap(() => widget.onVerseTap(verse.number)),
                    style: TextStyle(backgroundColor: _background(verse.number)),
                  ),
                  if (_noteAt(verse.number) case final note?) _noteIcon(note),
                ],
              ),
              style: _body,
            ),
          ),
      ],
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({required this.note, required this.palette, required this.onTap});

  final BibleNote note;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: palette.border)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(note.reference, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.accent)),
                const SizedBox(height: 4),
                Text(note.body, style: TextStyle(fontSize: 15, height: 1.45, color: palette.text)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CommentaryCard extends StatelessWidget {
  const _CommentaryCard({required this.commentary, required this.palette});

  final BibleCommentary commentary;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = commentary;
    final head = [c.sourceLabel, if (c.verseStart != null) 'ст. ${c.verseStart}'].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: palette.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: palette.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(head.toUpperCase(), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: palette.muted)),
            if (c.title.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(c.title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: palette.text))),
            Padding(padding: const EdgeInsets.only(top: 4), child: Text(c.body, style: TextStyle(fontSize: 15, height: 1.5, color: palette.text))),
          ],
        ),
      ),
    );
  }
}
