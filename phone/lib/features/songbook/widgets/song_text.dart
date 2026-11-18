import 'package:material_ui/material_ui.dart';

import '../logic/song_format.dart';
import 'reader_palette.dart';

/// Кусок строки для показа: слово (со своими пробелами) и аккорд над ним.
class Fragment {
  const Fragment(this.chord, this.text);
  final String? chord;
  final String text;
}

/// Режем строку на слова, чтобы длинная строка переносилась по словам,
/// а аккорд оставался над своим слогом.
List<Fragment> fragmentsOf(LineBlock line) {
  // Пробелы в начале куска уходят к предыдущему: аккорд стоит над буквой, а не над пробелом.
  final parts = [for (final s in line.segments) (s.chordText, s.text)];
  for (var i = 1; i < parts.length; i++) {
    final text = parts[i].$2;
    final trimmed = text.trimLeft();
    if (trimmed.length != text.length && parts[i].$1 != null) {
      final gap = text.substring(0, text.length - trimmed.length);
      parts[i - 1] = (parts[i - 1].$1, parts[i - 1].$2 + gap);
      parts[i] = (parts[i].$1, trimmed);
    }
  }
  final out = <Fragment>[];
  for (final (chord, text) in parts) {
    final words = RegExp(r'\s*\S+\s*|\s+').allMatches(text).map((m) => m.group(0)!).toList();
    if (words.isEmpty) {
      if (chord != null) out.add(Fragment(chord, ''));
      continue;
    }
    for (var i = 0; i < words.length; i++) {
      out.add(Fragment(i == 0 ? chord : null, words[i]));
    }
  }
  // Пробел в конце строки не нужен.
  if (out.isNotEmpty) {
    final last = out.last;
    out[out.length - 1] = Fragment(last.chord, last.text.trimRight());
  }
  return out;
}

/// Блоки песни: заголовки секций, строки с аккордами, ряды аккордов.
class SongText extends StatelessWidget {
  const SongText({
    super.key,
    required this.blocks,
    required this.palette,
    required this.fontSize,
    required this.showChords,
    required this.controller,
    this.bottomPadding = 120,
  });

  final List<SongBlock> blocks;
  final ReaderPalette palette;
  final double fontSize;
  final bool showChords;
  final ScrollController controller;
  final double bottomPadding;

  @override
  Widget build(BuildContext context) {
    // Размер задаётся настройкой песни, поэтому системный масштаб не умножаем второй раз.
    return MediaQuery.withNoTextScaling(
      child: ListView.builder(
        controller: controller,
        padding: EdgeInsets.fromLTRB(18, 14, 18, bottomPadding + MediaQuery.paddingOf(context).bottom),
        itemCount: blocks.length,
        itemBuilder: (context, index) => _block(blocks[index], index),
      ),
    );
  }

  Widget _block(SongBlock block, int index) {
    switch (block) {
      case SectionBlock():
        return Padding(
          padding: EdgeInsets.only(top: index == 0 ? 0 : 10, bottom: 12),
          child: Align(alignment: Alignment.centerLeft, child: SectionPill(block.title, palette)),
        );
      case GapBlock():
        return SizedBox(height: fontSize * 0.5);
      case ChordRowBlock():
        if (!showChords) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Container(
            padding: const EdgeInsets.only(left: 12),
            decoration: BoxDecoration(border: Border(left: BorderSide(color: palette.chordRule, width: 2))),
            child: Wrap(
              spacing: fontSize * 0.9,
              runSpacing: 4,
              children: [
                for (final c in block.chords)
                  Text(
                    c.text,
                    style: TextStyle(
                      fontSize: fontSize * 0.76,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: palette.chord,
                    ),
                  ),
              ],
            ),
          ),
        );
      case LineBlock():
        return Padding(padding: const EdgeInsets.only(bottom: 8), child: _Line(block, palette, fontSize, showChords));
    }
  }
}

class SectionPill extends StatelessWidget {
  const SectionPill(this.title, this.palette, {super.key});
  final String title;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: palette.border),
        ),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1.4, color: palette.secondary),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.line, this.palette, this.fontSize, this.showChords);

  final LineBlock line;
  final ReaderPalette palette;
  final double fontSize;
  final bool showChords;

  @override
  Widget build(BuildContext context) {
    final lyric = TextStyle(
      fontSize: fontSize,
      height: 1.3,
      fontWeight: FontWeight.w500,
      letterSpacing: fontSize * 0.005,
      color: palette.text,
    );
    if (!showChords || !line.hasChords) {
      return Text(line.segments.map((s) => s.text).join().trim(), style: lyric);
    }
    final chordStyle = TextStyle(fontSize: fontSize * 0.76, height: 1.25, fontWeight: FontWeight.w700, color: palette.chord);
    final chordHeight = fontSize * 0.76 * 1.25;
    final fragments = fragmentsOf(line);
    return Container(
      padding: const EdgeInsets.only(left: 12),
      decoration: BoxDecoration(border: Border(left: BorderSide(color: palette.chordRule, width: 2))),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.end,
        children: [
          for (final f in fragments)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: SizedBox(
                    height: chordHeight,
                    child: f.chord == null ? null : Text(f.chord!, style: chordStyle, softWrap: false),
                  ),
                ),
                Text(f.text, style: lyric),
              ],
            ),
        ],
      ),
    );
  }
}
