import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/songbook/logic/chords.dart';

void main() {
  group('разбор аккордов', () {
    test('обычные аккорды', () {
      for (final c in ['A', 'Am', 'F#m7', 'Bb', 'C#dim', 'Gsus4', 'Dadd9', 'Cmaj7', 'E7', 'Am7b5', 'H', 'Hm', 'H7', 'A/C#', 'H/D#']) {
        expect(ChordSymbol.tryParse(c), isNotNull, reason: c);
      }
    });

    test('слова и мусор — не аккорды', () {
      for (final c in ['Dad', 'Be', 'Face', 'Hello', 'Слава', 'Bad', '', '12', 'x']) {
        expect(ChordSymbol.tryParse(c), isNull, reason: c);
      }
    });

    test('запись через обратную косую и знаки ♯ ♭', () {
      expect(ChordSymbol.tryParse(r'H\D#')?.transposed(0, const KeyContext()), 'H/D#');
      expect(ChordSymbol.tryParse('F♯m')?.transposed(0, const KeyContext()), 'F#m');
    });

    test('кириллические названия нот', () {
      final c = ChordSymbol.tryParse('Ля', allowCyrillic: true);
      expect(c, isNotNull);
      expect(c!.transposed(2, const KeyContext()), 'Си');
      expect(ChordSymbol.tryParse('Ля'), isNull, reason: 'в строке аккордов кириллица — это слово');
    });
  });

  group('транспонирование', () {
    const sharp = KeyContext();
    const flat = KeyContext(preferFlats: true);

    String t(String chord, int by, [KeyContext ctx = sharp]) => ChordSymbol.tryParse(chord)!.transposed(by, ctx);

    test('вверх и вниз', () {
      expect(t('A', 2), 'B', reason: 'без H в песне натуральная си пишется B');
      expect(t('C', 1), 'C#');
      expect(t('C', -1), 'B');
      expect(t('E', 12), 'E');
      expect(t('E', -12), 'E');
    });

    test('суффикс сохраняется', () {
      expect(t('F#m7', -2), 'Em7');
      expect(t('Csus4', 2), 'Dsus4');
      expect(t('Am7b5', 3), 'Cm7b5');
      expect(t('Gmaj7', 2), 'Amaj7');
    });

    test('бас в слэш-аккордах двигается вместе с корнем', () {
      expect(t('H/D#', 1), 'C/E');
      expect(t('A/C#', 2), 'B/D#');
    });

    test('сдвиг на ноль возвращает исходную запись', () {
      expect(t('Bb', 0, sharp), 'Bb');
      expect(t('A/C#', 0), 'A/C#');
    });

    test('бемоли или диезы — по тональности', () {
      expect(t('C', 1, flat), 'Db');
      expect(t('C', 1, sharp), 'C#');
      expect(t('D', 1, flat), 'Eb');
      expect(t('F', 5, flat), 'Bb');
    });

    test('H-нотация сохраняется: натуральное си — H, бемольное — B', () {
      const h = KeyContext(preferFlats: true, hStyle: true);
      expect(t('A', 2, h), 'H');
      expect(t('A', 1, h), 'B');
      const hSharp = KeyContext(hStyle: true);
      expect(t('A', 1, hSharp), 'A#');
    });

    test('в песне с H одиночное B — это си-бемоль', () {
      final b = ChordSymbol.tryParse('B', hSongStyle: true)!;
      const h = KeyContext(preferFlats: true, hStyle: true);
      expect(b.transposed(2, h), 'C');
      expect(b.transposed(-1, h), 'A');
      expect(b.transposed(0, h), 'B');
      expect(ChordSymbol.tryParse('H', hSongStyle: true)!.transposed(1, h), 'C');
    });

    test('латинское B без H — натуральное си', () {
      expect(t('A', 2), 'B');
      expect(ChordSymbol.tryParse('B')!.transposed(0, sharp), 'B');
      expect(ChordSymbol.tryParse('B')!.transposed(1, sharp), 'C');
    });
  });

  group('тональность', () {
    test('какие тональности «бемольные»', () {
      expect(keyPrefersFlats('F'), isTrue);
      expect(keyPrefersFlats('Bb'), isTrue);
      expect(keyPrefersFlats('Dm'), isTrue);
      expect(keyPrefersFlats('G'), isFalse);
      expect(keyPrefersFlats('Em'), isFalse);
      expect(keyPrefersFlats('A'), isFalse);
    });

    test('название тональности после сдвига', () {
      expect(transposeKey('A', 2, hStyle: false), 'B');
      expect(transposeKey('Am', 3, hStyle: false), 'Cm');
      expect(transposeKey('C', -1, hStyle: false), 'B');
      expect(transposeKey('C', 1, hStyle: false), 'Db', reason: 'Db-мажор удобнее, чем C#');
      expect(transposeKey('G', 3, hStyle: true), 'B');
      expect(transposeKey('', 3, hStyle: false), '');
    });

    test('сдвиг между двумя тональностями', () {
      expect(semitonesBetween('A', 'C'), 3);
      expect(semitonesBetween('A', 'G'), -2);
      expect(semitonesBetween('C', 'C'), 0);
      expect(semitonesBetween('E', 'Eb'), -1);
    });

    test('каподастр: какие аккорды играть', () {
      // Звучит в A, каподастр на 2 → играем формы G.
      expect(shapeShift(transpose: 0, capo: 2, concert: false), -2);
      expect(shapeShift(transpose: 0, capo: 2, concert: true), 0);
      expect(shapeShift(transpose: 3, capo: 2, concert: false), 1);
      expect(shapeShift(transpose: 3, capo: 0, concert: false), 3);
    });
  });
}
