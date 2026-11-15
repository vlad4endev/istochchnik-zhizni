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

class ChordSheet extends StatelessWidget {
  const ChordSheet({super.key, required this.content});
  final String content;

  @override
  Widget build(BuildContext context) {
    final lines = plainSongText(content).split('\n');
    final children = <Widget>[];
    for (var index = 0; index < lines.length; index++) {
      final line = lines[index];
      final next = index + 1 < lines.length ? lines[index + 1] : null;
      if (lineIsChordsOnly(line) && next != null && !lineIsChordsOnly(next) && !_chordPro.hasMatch(next)) {
        children.add(_StackedLine(chords: line, lyrics: next));
        index++;
        continue;
      }
      if (_chordPro.hasMatch(line)) {
        children.add(_ChordProLine(line: line));
        continue;
      }
      children.add(Text(line.isEmpty ? ' ' : line, style: const TextStyle(fontSize: 16, height: 1.45)));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

class _ChordProLine extends StatelessWidget {
  const _ChordProLine({required this.line});
  final String line;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.end,
        children: [
          for (final bit in parseChordPro(line))
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bit.chord, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
                Text(bit.text.isEmpty ? ' ' : bit.text, style: const TextStyle(fontSize: 16)),
              ],
            ),
        ],
      ),
    );
  }
}

class _StackedLine extends StatelessWidget {
  const _StackedLine({required this.chords, required this.lyrics});
  final String chords;
  final String lyrics;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(chords, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontFamily: 'monospace', fontSize: 13)),
          Text(lyrics, style: const TextStyle(fontFamily: 'monospace', fontSize: 16, height: 1.35)),
        ],
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
    return Scaffold(
      appBar: AppBar(title: Text(title.isEmpty ? 'Песня' : title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (keyName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text('Тональность $keyName', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ChordSheet(content: content),
        ],
      ),
    );
  }
}
