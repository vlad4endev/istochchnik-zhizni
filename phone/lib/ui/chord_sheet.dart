import 'package:material_ui/material_ui.dart';

final _chordToken = RegExp(
  r'^[A-H][#b]?(?:maj|min|m|dim|aug|sus|add)?\d*(?:/[A-H][#b]?)?$',
  caseSensitive: false,
);
final _chordPro = RegExp(r'\[([A-Ha-h][#b]?[^\]]{0,12})\]');

class ChordBit {
  const ChordBit(this.chord, this.text);
  final String chord;
  final String text;
}

bool lineIsChordsOnly(String line) {
  final parts = line.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
  if (parts.isEmpty) return false;
  return parts.every(_chordToken.hasMatch);
}

List<ChordBit> parseChordPro(String line) {
  final bits = <ChordBit>[];
  var cursor = 0;
  for (final match in _chordPro.allMatches(line)) {
    if (match.start > cursor) {
      bits.add(ChordBit('', line.substring(cursor, match.start)));
    }
    bits.add(ChordBit(match.group(1) ?? '', ''));
    cursor = match.end;
  }
  if (cursor < line.length) {
    bits.add(ChordBit('', line.substring(cursor)));
  }
  if (bits.isEmpty) bits.add(ChordBit('', line));
  return bits;
}

String plainSongText(String raw) {
  return raw
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</p>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&');
}

/// Моноширинные шрифты по платформам: аккорды должны стоять над своими слогами.
const _mono = ['Roboto Mono', 'Menlo', 'Courier New', 'Courier', 'monospace'];

final _sectionLine = RegExp(
  r'^\s*\[?\s*((?:припев|куплет|бридж|мост|кода|вступление|проигрыш|окончание|chorus|verse|bridge|intro|outro)[^\]]*?)\s*\]?\s*:?\s*$',
  caseSensitive: false,
);

/// Подпись части песни из строки «[Припев]» или «Куплет 1:», иначе null.
String? sectionLabel(String line) {
  final match = _sectionLine.firstMatch(line);
  if (match == null) return null;
  return match.group(1)!.trim();
}

/// Цвета листа с аккордами: тёмный экран песни или светлый лист.
class ChordColors {
  const ChordColors({required this.chord, required this.text, required this.section, required this.sectionText});

  final Color chord;
  final Color text;
  final Color section;
  final Color sectionText;

  static const dark = ChordColors(
    chord: Color(0xFFF2B879),
    text: Colors.white,
    section: Color(0x1FFFFFFF),
    sectionText: Color(0xD9FFFFFF),
  );
}

class ChordSheet extends StatelessWidget {
  const ChordSheet({super.key, required this.content, this.colors, this.fontSize = 18});
  final String content;
  final ChordColors? colors;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final palette = colors ??
        ChordColors(
          chord: Theme.of(context).colorScheme.primary,
          text: Theme.of(context).colorScheme.onSurface,
          section: Theme.of(context).colorScheme.surfaceContainerHighest,
          sectionText: Theme.of(context).colorScheme.onSurfaceVariant,
        );
    final lines = plainSongText(content).split('\n');
    final children = <Widget>[];
    for (var index = 0; index < lines.length; index++) {
      final line = lines[index];
      final next = index + 1 < lines.length ? lines[index + 1] : null;
      final section = sectionLabel(line);
      if (section != null) {
        children.add(_SectionPill(label: section, colors: palette));
        continue;
      }
      if (lineIsChordsOnly(line) && next != null && !lineIsChordsOnly(next) && !_chordPro.hasMatch(next)) {
        children.add(_StackedLine(chords: line, lyrics: next, colors: palette, fontSize: fontSize));
        index++;
        continue;
      }
      if (_chordPro.hasMatch(line)) {
        children.add(_ChordProLine(line: line, colors: palette, fontSize: fontSize));
        continue;
      }
      children.add(Text(
        line.isEmpty ? ' ' : line,
        style: TextStyle(fontSize: fontSize, height: 1.45, fontWeight: FontWeight.w500, color: palette.text),
      ));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

class _SectionPill extends StatelessWidget {
  const _SectionPill({required this.label, required this.colors});
  final String label;
  final ChordColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: colors.section, borderRadius: BorderRadius.circular(8)),
        child: Text(
          label.toUpperCase(),
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: colors.sectionText),
        ),
      ),
    );
  }
}

class _ChordProLine extends StatelessWidget {
  const _ChordProLine({required this.line, required this.colors, required this.fontSize});
  final String line;
  final ChordColors colors;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.end,
        children: [
          for (final bit in parseChordPro(line))
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bit.chord, style: TextStyle(color: colors.chord, fontWeight: FontWeight.w800, fontSize: fontSize * 0.8)),
                Text(
                  bit.text.isEmpty ? ' ' : bit.text,
                  style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, color: colors.text),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _StackedLine extends StatelessWidget {
  const _StackedLine({required this.chords, required this.lyrics, required this.colors, required this.fontSize});
  final String chords;
  final String lyrics;
  final ChordColors colors;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              chords,
              style: TextStyle(color: colors.chord, fontWeight: FontWeight.w800, fontFamily: 'monospace', fontFamilyFallback: _mono, fontSize: fontSize * 0.82),
            ),
            Text(
              lyrics,
              style: TextStyle(fontFamily: 'monospace', fontFamilyFallback: _mono, fontSize: fontSize, height: 1.35, color: colors.text),
            ),
          ],
        ),
      ),
    );
  }
}

/// Экран песни: тёмный лист с аккордами, тональность и размер шрифта.
class SongView extends StatefulWidget {
  const SongView({super.key, required this.title, required this.content, this.keyName = '', this.subtitle = '', this.loading = false, this.error, this.onRetry});

  final String title;
  final String content;
  final String keyName;
  final String subtitle;
  final bool loading;
  final String? error;
  final VoidCallback? onRetry;

  @override
  State<SongView> createState() => _SongViewState();
}

class _SongViewState extends State<SongView> {
  static const _background = Color(0xFF141317);
  double _size = 18;

  void _resize(double delta) => setState(() => _size = (_size + delta).clamp(14, 30));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
              child: Row(
                children: [
                  Material(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => Navigator.of(context).maybePop(),
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(Icons.chevron_left_rounded, color: Colors.white, semanticLabel: 'Назад'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title.isEmpty ? 'Песня' : widget.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
                        ),
                        if (widget.subtitle.isNotEmpty)
                          Text(widget.subtitle, style: const TextStyle(fontSize: 12.5, color: Color(0x99FFFFFF))),
                      ],
                    ),
                  ),
                  if (widget.keyName.isNotEmpty)
                    Semantics(
                      label: 'Тональность ${widget.keyName}',
                      excludeSemantics: true,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 40),
                        height: 40,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0xFF3A2A16), borderRadius: BorderRadius.circular(12)),
                        child: Text(
                          widget.keyName,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFFF2B879)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: widget.loading
                  ? const Center(child: CircularProgressIndicator(color: Color(0xFFF2B879)))
                  : widget.error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(widget.error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
                                if (widget.onRetry != null)
                                  TextButton(
                                    style: TextButton.styleFrom(foregroundColor: const Color(0xFFF2B879)),
                                    onPressed: widget.onRetry,
                                    child: const Text('Повторить'),
                                  ),
                              ],
                            ),
                          ),
                        )
                      : widget.content.trim().isEmpty
                          ? const Center(child: Text('Текст песни не добавлен', style: TextStyle(color: Colors.white70)))
                          : ListView(
                              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                              children: [ChordSheet(content: widget.content, colors: ChordColors.dark, fontSize: _size)],
                            ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1F1E24),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(left: 10),
                      child: Text('Размер текста', style: TextStyle(fontSize: 13, color: Color(0x99FFFFFF))),
                    ),
                    const Spacer(),
                    _SizeButton(label: 'A−', tooltip: 'Уменьшить текст', onTap: () => _resize(-2)),
                    const SizedBox(width: 6),
                    _SizeButton(label: 'A+', tooltip: 'Увеличить текст', onTap: () => _resize(2)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SizeButton extends StatelessWidget {
  const _SizeButton({required this.label, required this.tooltip, required this.onTap});
  final String label;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 52,
            height: 44,
            child: Center(
              child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ),
        ),
      ),
    );
  }
}

class LyricPage extends StatelessWidget {
  const LyricPage({super.key, required this.title, required this.content, this.keyName = ''});
  final String title;
  final String content;
  final String keyName;

  @override
  Widget build(BuildContext context) {
    return SongView(title: title, content: content, keyName: keyName);
  }
}
