/// Ноты, аккорды и транспонирование. Чистый Dart, без Flutter: легко тестировать.
library;

const _latinSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#'];
const _latinFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb'];
const _cyrSharp = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си'];
const _cyrFlat = ['До', 'Реb', 'Ре', 'Миb', 'Ми', 'Фа', 'Сольb', 'Соль', 'Ляb', 'Ля', 'Сиb', 'Си'];

const _latinRoots = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11, 'H': 11};
const _cyrRoots = {'до': 0, 'ре': 2, 'ми': 4, 'фа': 5, 'соль': 7, 'ля': 9, 'си': 11};

/// Хвост аккорда: качество и надстройки (m, maj7, sus4, add9, b5, (9)…).
const _suffixPattern = r'(?:maj|min|dim|aug|sus|add|m|M|[+\-°ø∆Δ^]|\d+|[#b]\d+|\([^)]*\))*';
final _latinChord = RegExp('^([A-H])([#b]?)($_suffixPattern)(?:/([A-H])([#b]?))?\$');
final _cyrChord = RegExp('^(До|Ре|Ми|Фа|Соль|Ля|Си)([#b]?)($_suffixPattern)(?:/([A-H])([#b]?))?\$', caseSensitive: false);

/// Контекст записи: как называть ноты после сдвига.
class KeyContext {
  const KeyContext({this.preferFlats = false, this.hStyle = false});

  /// Бемоли вместо диезов (для тональностей F, Bb, Dm, Gm…).
  final bool preferFlats;

  /// Песня записана с H: натуральное си — H, бемольное — B.
  final bool hStyle;
}

String _noteName(int index, KeyContext ctx, {bool cyrillic = false}) {
  final i = ((index % 12) + 12) % 12;
  if (cyrillic) return (ctx.preferFlats ? _cyrFlat : _cyrSharp)[i];
  if (i == 11) return ctx.hStyle ? 'H' : 'B';
  if (i == 10 && ctx.hStyle && ctx.preferFlats) return 'B';
  return (ctx.preferFlats ? _latinFlat : _latinSharp)[i];
}

int _accidental(String acc) => acc == '#' ? 1 : (acc == 'b' ? -1 : 0);

int _latinRoot(String letter, String accidental, bool hSongStyle) {
  if (hSongStyle && letter == 'B' && accidental.isEmpty) return 10;
  return _latinRoots[letter]! + _accidental(accidental);
}

String _normalize(String raw) =>
    raw.trim().replaceAll('♯', '#').replaceAll('♭', 'b').replaceAll(r'\', '/');

class ChordSymbol {
  const ChordSymbol._({
    required this.original,
    required this.root,
    required this.suffix,
    required this.bass,
    required this.cyrillic,
    required this.usesH,
  });

  /// Запись как в тексте — её возвращаем, если сдвиг нулевой.
  final String original;
  final int root;
  final String suffix;
  final int? bass;
  final bool cyrillic;
  final bool usesH;

  /// Разбирает аккорд. Кириллические ноты («Ля», «Ре») — только если разрешено:
  /// в строке аккордов над текстом это были бы обычные слова.
  ///
  /// [hSongStyle] — в песне есть H, значит это немецкая запись, где одиночное B
  /// означает си-бемоль, а натуральное си пишется H.
  static ChordSymbol? tryParse(String raw, {bool allowCyrillic = false, bool hSongStyle = false}) {
    final text = _normalize(raw);
    if (text.isEmpty) return null;
    final latin = _latinChord.firstMatch(text);
    if (latin != null) {
      final letter = latin.group(1)!;
      final rootAcc = latin.group(2)!;
      final root = (_latinRoot(letter, rootAcc, hSongStyle) + 12) % 12;
      final bassLetter = latin.group(4);
      final bassAcc = latin.group(5) ?? '';
      final bass = bassLetter == null ? null : (_latinRoot(bassLetter, bassAcc, hSongStyle) + 12) % 12;
      return ChordSymbol._(
        original: text,
        root: root,
        suffix: latin.group(3)!,
        bass: bass,
        cyrillic: false,
        usesH: letter == 'H' || bassLetter == 'H',
      );
    }
    if (!allowCyrillic) return null;
    final cyr = _cyrChord.firstMatch(text);
    if (cyr == null) return null;
    final root = (_cyrRoots[cyr.group(1)!.toLowerCase()]! + _accidental(cyr.group(2)!) + 12) % 12;
    final bassLetter = cyr.group(4);
    final bass = bassLetter == null ? null : (_latinRoots[bassLetter]! + _accidental(cyr.group(5)!) + 12) % 12;
    return ChordSymbol._(original: text, root: root, suffix: cyr.group(3)!, bass: bass, cyrillic: true, usesH: false);
  }

  /// Минорный ли аккорд (для выбора бемолей/диезов по тональности).
  bool get isMinor => suffix.startsWith('m') && !suffix.startsWith('maj');

  String transposed(int semitones, KeyContext ctx) {
    if (semitones % 12 == 0) return original;
    final bassPart = bass == null ? '' : '/${_noteName(bass! + semitones, ctx)}';
    return '${_noteName(root + semitones, ctx, cyrillic: cyrillic)}$suffix$bassPart';
  }
}

/// Бемольные тональности: F, B♭, E♭, A♭, D♭ и d, g, c, f, b♭, e♭.
bool keyPrefersFlats(String key) {
  final chord = ChordSymbol.tryParse(key, allowCyrillic: true);
  if (chord == null) return false;
  return _prefersFlats(chord.root, chord.isMinor);
}

bool _prefersFlats(int root, bool minor) {
  const majorFlats = {5, 10, 3, 8, 1};
  const minorFlats = {2, 7, 0, 5, 10, 3};
  return (minor ? minorFlats : majorFlats).contains(root);
}

/// Нужны ли бемоли, если сдвинуть [key] на [semitones]. Неизвестная тональность — диезы.
bool keyPrefersFlatsAfter(String key, int semitones, {bool hSongStyle = false}) {
  final chord = ChordSymbol.tryParse(key, allowCyrillic: true, hSongStyle: hSongStyle);
  if (chord == null) return false;
  return _prefersFlats((chord.root + semitones + 12 * 4) % 12, chord.isMinor);
}

/// Тональность после сдвига: `A` + 2 → `B`. Пустая или непонятная — как есть.
String transposeKey(String key, int semitones, {required bool hStyle}) {
  final chord = ChordSymbol.tryParse(key, allowCyrillic: true);
  if (chord == null) return key.trim();
  final target = (chord.root + semitones + 12 * 4) % 12;
  final ctx = KeyContext(preferFlats: _prefersFlats(target, chord.isMinor), hStyle: hStyle);
  if (semitones % 12 == 0) return chord.original;
  return '${_noteName(target, ctx, cyrillic: chord.cyrillic)}${chord.suffix}';
}

/// На сколько полутонов сдвинуть из тональности [from] в [to] (кратчайший путь, −5…+6).
int semitonesBetween(String from, String to) {
  final a = ChordSymbol.tryParse(from, allowCyrillic: true);
  final b = ChordSymbol.tryParse(to, allowCyrillic: true);
  if (a == null || b == null) return 0;
  var d = (b.root - a.root) % 12;
  if (d < 0) d += 12;
  return d > 6 ? d - 12 : d;
}

/// Сдвиг аккордов на экране: с каподастром играем более низкие формы,
/// а «концертные» аккорды показывают то, что реально звучит.
int shapeShift({required int transpose, required int capo, required bool concert}) =>
    concert ? transpose : transpose - capo;
