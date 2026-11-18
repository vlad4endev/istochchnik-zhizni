/// Разбор текста песни в блоки для показа: секции, строки с аккордами над слогами,
/// ряды аккордов. Понимает ChordPro (`{sec:Припев}`, `[Am]`) и аккорды над строкой.
/// Чистый Dart, без Flutter.
library;

import 'chords.dart';

/// Кусок строки: аккорд (может не быть) и слог/слова под ним.
class Segment {
  const Segment({this.chord, this.chordText, required this.text});

  /// Разобранный аккорд — его можно транспонировать. Null у `N.C.` и непонятных обозначений.
  final ChordSymbol? chord;

  /// Что показать над текстом. Null — над этим куском аккорда нет.
  final String? chordText;
  final String text;
}

class ChordToken {
  const ChordToken(this.text, this.chord);
  final String text;
  final ChordSymbol? chord;
}

sealed class SongBlock {
  const SongBlock();
}

class SectionBlock extends SongBlock {
  const SectionBlock(this.title);
  final String title;
}

class LineBlock extends SongBlock {
  const LineBlock(this.segments);
  final List<Segment> segments;
  bool get hasChords => segments.any((s) => s.chordText != null);
}

/// Строка из одних аккордов (вступление, проигрыш).
class ChordRowBlock extends SongBlock {
  const ChordRowBlock(this.chords);
  final List<ChordToken> chords;
}

class GapBlock extends SongBlock {
  const GapBlock();
}

class ParsedSong {
  const ParsedSong(this.blocks, {required this.usesH, required this.firstChord});
  final List<SongBlock> blocks;

  /// Песня записана с H (немецкая нотация).
  final bool usesH;

  /// Первый аккорд — подсказка о тональности, если она не указана.
  final String? firstChord;
}

// ---------------------------------------------------------------- секции

final _sectionDirective = RegExp(r'^\{section:\s*([^}]*?)\s*\}$', caseSensitive: false);
final _secMarker = RegExp(r'^\{sec:\s*([^}]*?)\s*\}$', caseSensitive: false);
final _commentMarker = RegExp(r'^\{(?:comment|c):\s*([^}]*?)\s*\}$', caseSensitive: false);
final _bracketTitle = RegExp(r'^\[\s*([^\]]+?)\s*\]$');
final _hashSection = RegExp(r'^\s*#\s*(.+?)\s*$');
final _plainSection = RegExp(
  r'^\s*(куплет|припев|предприпев|бридж|мост|проигрыш|вступление|окончание|кода|аутро|интро|соло|инструментал|verse|chorus|bridge|intro|outro)\s*([0-9ivx]+)?\s*:?\s*$',
  caseSensitive: false,
);
final _startSection = RegExp(r'^\{(?:start_of_|s)(chorus|verse|bridge)\}$', caseSensitive: false);
final _shortStart = RegExp(r'^\{(soc|sov|sob)\}$', caseSensitive: false);
final _endSection = RegExp(r'^\{(?:end_of_|e)(chorus|verse|bridge)\}$|^\{(eoc|eov|eob)\}$', caseSensitive: false);

const _englishSections = {
  'chorus': 'Припев',
  'verse': 'Куплет',
  'bridge': 'Бридж',
  'intro': 'Вступление',
  'outro': 'Аутро',
};

String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).toLowerCase();

/// «ПРИПЕВ», «припев 2», «Chorus» → «Припев», «Припев 2». Остальные названия как есть.
String _sectionName(String raw) {
  final t = raw.trim();
  final m = _plainSection.firstMatch(t);
  if (m == null) return t;
  final base = m.group(1)!.toLowerCase();
  final head = _englishSections[base] ?? _capitalize(base);
  final n = (m.group(2) ?? '').trim();
  return n.isEmpty ? head : '$head $n';
}

/// Название секции из служебной строки или null, если это обычная строка.
String? parseSectionTitle(String line) {
  final t = line.trim();
  if (t.isEmpty) return null;
  for (final re in [_sectionDirective, _secMarker, _commentMarker]) {
    final m = re.firstMatch(t);
    if (m != null) {
      final name = _sectionName(m.group(1) ?? '');
      return name.isEmpty ? null : name;
    }
  }
  final start = _startSection.firstMatch(t);
  if (start != null) return _sectionName(start.group(1)!);
  final short = _shortStart.firstMatch(t);
  if (short != null) {
    return switch (short.group(1)!.toLowerCase()) {
      'soc' => 'Припев',
      'sov' => 'Куплет',
      _ => 'Бридж',
    };
  }
  if (_endSection.hasMatch(t)) return null;
  if (_plainSection.hasMatch(t)) return _sectionName(t);
  final hash = _hashSection.firstMatch(t);
  if (hash != null) {
    final name = _sectionName(hash.group(1) ?? '');
    return name.isEmpty ? null : name;
  }
  final bracket = _bracketTitle.firstMatch(t);
  if (bracket != null) {
    final title = bracket.group(1)!.trim();
    if (title.isEmpty || ChordSymbol.tryParse(title) != null || _isNoChord(title)) return null;
    final name = _sectionName(title);
    return name.isEmpty ? null : name;
  }
  return null;
}

// ---------------------------------------------------------------- подготовка

final _directiveLine = RegExp(r'^\{\s*([a-z_]+)(?::[^}]*)?\s*\}$', caseSensitive: false);
const _renderedDirectives = {
  'sec', 'section', 'comment', 'c',
  'start_of_chorus', 'start_of_verse', 'start_of_bridge',
  'end_of_chorus', 'end_of_verse', 'end_of_bridge',
  'soc', 'sov', 'sob', 'eoc', 'eov', 'eob',
};

final _junkPatterns = <RegExp>[
  RegExp(r'^(?:сборник\s+песен|songbook)', caseSensitive: false),
  RegExp(r'^[«"]?\s*источник\s+жизни\s*[»"]?$', caseSensitive: false),
  RegExp(r'^source\s+of\s+life$', caseSensitive: false),
  RegExp(r'^(?:источник|source|автор|author|композитор|composer|перевод|translation)\s*:', caseSensitive: false),
  RegExp(r'https?://', caseSensitive: false),
  RegExp(r'^www\.', caseSensitive: false),
  RegExp(r'holychords|kgmusic|worshiptogether|genius\.com|ccli', caseSensitive: false),
  RegExp(r'^[🎵♪🎶]'),
];

String _decodeEntities(String s) => s
    .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'</p>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'</?(?:p|b|i|u|em|strong|span|div)(?:\s[^>]*)?>', caseSensitive: false), '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#33;', '!')
    .replaceAll('&#092;', r'\')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

List<String> _prepareLines(String raw) {
  final text = _decodeEntities(raw)
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceAll(RegExp('[​-‍﻿]'), '');
  final out = <String>[];
  for (final line in text.split('\n')) {
    final t = line.trim();
    if (t.isNotEmpty) {
      final directive = _directiveLine.firstMatch(t);
      if (directive != null && !_renderedDirectives.contains(directive.group(1)!.toLowerCase())) continue;
      if (_junkPatterns.any((re) => re.hasMatch(t))) continue;
    }
    out.add(line.trimRight());
  }
  return out;
}

/// Табуляция → пробелы до колонки, кратной [width], как в редакторе.
String expandTabs(String line, [int width = 8]) {
  if (!line.contains('\t')) return line;
  final b = StringBuffer();
  var col = 0;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    if (ch == '\t') {
      final pad = width - (col % width);
      b.write(' ' * pad);
      col += pad;
    } else {
      b.write(ch);
      col++;
    }
  }
  return b.toString();
}

// ---------------------------------------------------------------- аккорды в строке

bool _isNoChord(String raw) {
  final t = raw.trim().replaceAll(RegExp(r'[\s.]'), '').toLowerCase();
  return t == 'nc' || t == 'tacet' || t == '—' || t == '–' || t == '-' || t == '…';
}

final _bracketChord = RegExp(r'\[([^\]\[]+)\]');

bool _hasBracketChord(String line, bool h) {
  for (final m in _bracketChord.allMatches(line)) {
    final token = m.group(1)!.trim();
    if (ChordSymbol.tryParse(token, allowCyrillic: true, hSongStyle: h) != null || _isNoChord(token)) return true;
  }
  return false;
}

const _lookalikes = {
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H',
  'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h',
};

/// Токен строки аккордов. Кириллические двойники латинских букв («Аm») принимаются,
/// только если токен похож на аккорд по хвосту (m, 7, sus…): одиночная «А» — это слово.
ChordSymbol? _chordToken(String tok, bool h) {
  final strict = ChordSymbol.tryParse(tok, hSongStyle: h);
  if (strict != null) return strict;
  if (tok.length < 2) return null;
  final first = tok[0];
  if (!_lookalikes.containsKey(first)) return null;
  final fixed = '${_lookalikes[first]}${tok.substring(1)}';
  if (RegExp(r'[А-Яа-яЁё]').hasMatch(tok.substring(1))) return null;
  return ChordSymbol.tryParse(fixed, hSongStyle: h);
}

class _Tok {
  const _Tok(this.col, this.text, this.chord);
  final int col;
  final String text;
  final ChordSymbol? chord;
}

/// Токены строки аккордов с колонками или null, если в строке есть что-то кроме аккордов.
List<_Tok>? _chordLineTokens(String line, bool h) {
  final expanded = expandTabs(line).replaceAll('|', ' ');
  final tokens = <_Tok>[];
  var real = 0;
  for (final m in RegExp(r'\S+').allMatches(expanded)) {
    final text = m.group(0)!;
    if (_isNoChord(text)) {
      tokens.add(_Tok(m.start, 'N.C.', null));
      continue;
    }
    final chord = _chordToken(text, h);
    if (chord == null) return null;
    tokens.add(_Tok(m.start, text.replaceAll(r'\', '/'), chord));
    real++;
  }
  return real == 0 ? null : tokens;
}

bool _hasLetters(String s) => RegExp(r'[A-Za-zА-Яа-яЁё]').hasMatch(s);

List<Segment> _segmentsFromBrackets(String line, bool h) {
  final segments = <Segment>[];
  ChordSymbol? chord;
  String? chordText;
  final text = StringBuffer();
  var cursor = 0;

  void flush() {
    final t = text.toString();
    if (chordText != null || t.isNotEmpty) {
      segments.add(Segment(chord: chord, chordText: chordText, text: t));
    }
    text.clear();
  }

  for (final m in _bracketChord.allMatches(line)) {
    final token = m.group(1)!.trim();
    final parsed = ChordSymbol.tryParse(token, allowCyrillic: true, hSongStyle: h);
    final isChord = parsed != null || _isNoChord(token);
    if (!isChord) continue; // скобки остаются обычным текстом
    text.write(line.substring(cursor, m.start));
    flush();
    chord = parsed;
    chordText = parsed != null ? token.replaceAll(r'\', '/') : 'N.C.';
    cursor = m.end;
  }
  text.write(line.substring(cursor));
  flush();
  return segments;
}

List<Segment> _segmentsFromStacked(List<_Tok> chords, String lyric) {
  final text = expandTabs(lyric);
  final segments = <Segment>[];
  final firstCol = chords.first.col;
  if (firstCol > 0 && text.isNotEmpty) {
    final end = firstCol.clamp(0, text.length);
    // Текст левее первого аккорда — без аккорда.
    if (end > 0) segments.add(Segment(text: text.substring(0, end)));
  }
  for (var i = 0; i < chords.length; i++) {
    final start = chords[i].col.clamp(0, text.length);
    final end = i + 1 < chords.length ? chords[i + 1].col.clamp(start, text.length) : text.length;
    segments.add(Segment(chord: chords[i].chord, chordText: chords[i].text, text: text.substring(start, end)));
  }
  return segments;
}

// ---------------------------------------------------------------- разбор

ParsedSong parseSong(String raw) {
  final first = _parse(raw, false);
  return first.usesH ? _parse(raw, true) : first;
}

ParsedSong _parse(String raw, bool h) {
  final lines = _prepareLines(raw);
  final blocks = <SongBlock>[];
  var usesH = false;
  String? firstChord;

  void note(ChordSymbol? chord, String? text) {
    if (chord != null) {
      if (chord.usesH) usesH = true;
      firstChord ??= text;
    }
  }

  void addGap() {
    if (blocks.isNotEmpty && blocks.last is! GapBlock) blocks.add(const GapBlock());
  }

  for (var i = 0; i < lines.length; i++) {
    final line = lines[i];
    final trimmed = line.trim();
    if (trimmed.isEmpty) {
      addGap();
      continue;
    }
    if (_endSection.hasMatch(trimmed)) continue;
    final section = parseSectionTitle(trimmed);
    if (section != null) {
      blocks.add(SectionBlock(section));
      continue;
    }

    if (_hasBracketChord(line, h)) {
      final segments = _segmentsFromBrackets(line, h);
      for (final s in segments) {
        note(s.chord, s.chordText);
      }
      final onlyChords = segments.every((s) => s.text.trim().isEmpty);
      if (onlyChords) {
        blocks.add(ChordRowBlock([for (final s in segments) ChordToken(s.chordText ?? '', s.chord)]));
      } else {
        blocks.add(LineBlock(segments));
      }
      continue;
    }

    final chordTokens = _chordLineTokens(line, h);
    if (chordTokens != null) {
      for (final t in chordTokens) {
        note(t.chord, t.text);
      }
      final next = i + 1 < lines.length ? lines[i + 1] : null;
      final nextIsLyric = next != null &&
          next.trim().isNotEmpty &&
          _hasLetters(next) &&
          parseSectionTitle(next) == null &&
          !_endSection.hasMatch(next.trim()) &&
          !_hasBracketChord(next, h) &&
          _chordLineTokens(next, h) == null;
      if (nextIsLyric) {
        blocks.add(LineBlock(_segmentsFromStacked(chordTokens, next)));
        i++;
      } else {
        blocks.add(ChordRowBlock([for (final t in chordTokens) ChordToken(t.text, t.chord)]));
      }
      continue;
    }

    blocks.add(LineBlock([Segment(text: line.trim())]));
  }

  while (blocks.isNotEmpty && blocks.last is GapBlock) {
    blocks.removeLast();
  }
  return ParsedSong(blocks, usesH: usesH, firstChord: firstChord);
}

/// Текст песни без аккордов и меток — для поиска и фрагментов в результатах.
String songPlainText(String raw) {
  final b = StringBuffer();
  for (final block in parseSong(raw).blocks) {
    switch (block) {
      case LineBlock():
        if (b.isNotEmpty) b.write('\n');
        b.write(block.segments.map((s) => s.text).join().replaceAll(RegExp(r'[ \t]+'), ' ').trim());
      case GapBlock():
        if (b.isNotEmpty) b.write('\n');
      case SectionBlock() || ChordRowBlock():
        break;
    }
  }
  return b.toString().trim();
}

// ---------------------------------------------------------------- сдвиг

/// Блоки с аккордами, сдвинутыми на [semitones]. Текст не меняется.
/// Бемоли или диезы — по [preferFlats], запись H сохраняется, если она была в песне.
List<SongBlock> shiftBlocks(ParsedSong song, int semitones, {required bool preferFlats}) {
  if (semitones % 12 == 0) return song.blocks;
  final ctx = KeyContext(preferFlats: preferFlats, hStyle: song.usesH);
  String? move(Segment s) => s.chord == null ? s.chordText : s.chord!.transposed(semitones, ctx);
  return [
    for (final block in song.blocks)
      switch (block) {
        LineBlock() => LineBlock([
            for (final s in block.segments) Segment(chord: s.chord, chordText: move(s), text: s.text),
          ]),
        ChordRowBlock() => ChordRowBlock([
            for (final c in block.chords) ChordToken(c.chord?.transposed(semitones, ctx) ?? c.text, c.chord),
          ]),
        _ => block,
      },
  ];
}
