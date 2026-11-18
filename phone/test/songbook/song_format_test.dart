import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/songbook/logic/song_format.dart';

List<String> kinds(ParsedSong s) => [for (final b in s.blocks) b.runtimeType.toString()];

String chordLine(LineBlock b) => b.segments.map((s) => '${s.chordText ?? ''}|${s.text}').join(' ‖ ');

void main() {
  group('метки секций', () {
    test('все привычные записи', () {
      expect(parseSectionTitle('{sec:Припев}'), 'Припев');
      expect(parseSectionTitle('{sec: Куплет 1 }'), 'Куплет 1');
      expect(parseSectionTitle('{section: Chorus}'), 'Припев');
      expect(parseSectionTitle('{comment: Бридж}'), 'Бридж');
      expect(parseSectionTitle('{soc}'), 'Припев');
      expect(parseSectionTitle('{start_of_verse}'), 'Куплет');
      expect(parseSectionTitle('Припев:'), 'Припев');
      expect(parseSectionTitle('ПРИПЕВ'), 'Припев');
      expect(parseSectionTitle('куплет 2'), 'Куплет 2');
      expect(parseSectionTitle('[Припев]'), 'Припев');
      expect(parseSectionTitle('# Вступление'), 'Вступление');
    });

    test('обычные строки и аккорды — не секции', () {
      expect(parseSectionTitle('Бога благослови, о, душа моя'), isNull);
      expect(parseSectionTitle('[Am]'), isNull);
      expect(parseSectionTitle('[F#7]'), isNull);
      expect(parseSectionTitle('{end_of_chorus}'), isNull);
      expect(parseSectionTitle(''), isNull);
    });
  });

  group('ChordPro', () {
    const sample = '''
{sec:Припев}
[A]Бога благосло[E]ви, о, душа [H/D#]моя,
[A]Пой и [E]превозноси!

{sec:Куплет 1}
[A]Проходит ночь, и [E]восходит
''';

    test('секции, строки и пустые промежутки', () {
      final s = parseSong(sample);
      expect(kinds(s), ['SectionBlock', 'LineBlock', 'LineBlock', 'GapBlock', 'SectionBlock', 'LineBlock']);
      expect((s.blocks.first as SectionBlock).title, 'Припев');
    });

    test('аккорд стоит над своим слогом', () {
      final line = parseSong(sample).blocks[1] as LineBlock;
      expect(chordLine(line), 'A|Бога благосло ‖ E|ви, о, душа  ‖ H/D#|моя,');
    });

    test('текст до первого аккорда остаётся без аккорда', () {
      final line = parseSong('Слава [C]Богу').blocks.single as LineBlock;
      expect(chordLine(line), '|Слава  ‖ C|Богу');
    });

    test('строка из одних аккордов — ряд аккордов', () {
      final s = parseSong('[A] [E] [H/D#]');
      expect(s.blocks.single, isA<ChordRowBlock>());
      expect((s.blocks.single as ChordRowBlock).chords.map((c) => c.text), ['A', 'E', 'H/D#']);
    });

    test('квадратные скобки не аккорды — остаются текстом', () {
      final line = parseSong('Он сказал [шёпотом] слова').blocks.single as LineBlock;
      expect(line.hasChords, isFalse);
      expect(line.segments.single.text, 'Он сказал [шёпотом] слова');
    });

    test('N.C. показывается как есть и не двигается', () {
      final line = parseSong('[N.C.]Тишина [A]и свет').blocks.single as LineBlock;
      expect(line.segments.first.chordText, 'N.C.');
      expect(line.segments.first.chord, isNull);
    });
  });

  group('аккорды над строкой', () {
    test('склеиваются с текстом по колонкам', () {
      final s = parseSong('A        E      H/D#\nБога благослови, душа моя');
      final line = s.blocks.single as LineBlock;
      expect(line.segments.map((x) => x.chordText), ['A', 'E', 'H/D#']);
      expect(line.segments.map((x) => x.text).join(), 'Бога благослови, душа моя');
      expect(line.segments.first.text, 'Бога благ');
    });

    test('аккорд правее конца текста не теряется', () {
      final line = parseSong('A    E       C\nОй').blocks.single as LineBlock;
      expect(line.segments.map((x) => x.chordText), ['A', 'E', 'C']);
      expect(line.segments.map((x) => x.text).join(), 'Ой');
    });

    test('аккорд левее первой буквы: текст целиком под ним', () {
      final line = parseSong('   A\nСлава').blocks.single as LineBlock;
      expect(line.segments.first.chordText, isNull);
      expect(line.segments.first.text, 'Сла');
      expect(line.segments[1].chordText, 'A');
    });

    test('табуляция считается как в редакторе', () {
      final line = parseSong('A\tE\nБога благословлю тебя').blocks.single as LineBlock;
      expect(line.segments.map((x) => x.chordText), ['A', 'E']);
      expect(line.segments[1].text.startsWith('г'), isTrue, reason: 'колонка 8: «Бога бла|гослов…»');
    });

    test('строка аккордов без текста под ней — ряд аккордов', () {
      final s = parseSong('A  E  H/D#\n\nСлава Богу');
      expect(s.blocks.first, isA<ChordRowBlock>());
      expect(s.blocks.last, isA<LineBlock>());
      expect((s.blocks.last as LineBlock).hasChords, isFalse);
    });

    test('две строки аккордов подряд', () {
      final s = parseSong('A  E\nD  C\nСлава');
      expect(kinds(s), ['ChordRowBlock', 'LineBlock']);
      expect((s.blocks.last as LineBlock).segments.map((x) => x.chordText).whereType<String>(), ['D', 'C']);
    });

    test('слова вроде «Dad» и русский текст не принимаются за аккорды', () {
      final s = parseSong('Dad Be Bad\nСлава');
      expect(kinds(s), ['LineBlock', 'LineBlock']);
      expect((s.blocks.first as LineBlock).hasChords, isFalse);
    });

    test('тактовые черты в строке аккордов', () {
      final line = parseSong('| A    | E\nСлава Богу').blocks.single as LineBlock;
      expect(line.segments.map((x) => x.chordText).whereType<String>(), ['A', 'E']);
    });
  });

  group('уборка текста', () {
    test('служебные директивы ChordPro скрываются', () {
      final s = parseSong('{title: Песня}\n{key: A}\n{tempo: 72}\n{sec:Припев}\nСлава');
      expect(kinds(s), ['SectionBlock', 'LineBlock']);
    });

    test('ссылки, источники и название сборника — мусор', () {
      final s = parseSong('Сборник песен\nhttps://holychords.com/x\nИсточник: сайт\n🎵 Песня\nСлава Богу');
      expect(kinds(s), ['LineBlock']);
      expect((s.blocks.single as LineBlock).segments.single.text, 'Слава Богу');
    });

    test('строка текста со словами «источник жизни» остаётся', () {
      final s = parseSong('Ты — источник жизни моей');
      expect((s.blocks.single as LineBlock).segments.single.text, 'Ты — источник жизни моей');
    });

    test('HTML-сущности и теги', () {
      final s = parseSong('Слава&nbsp;Богу<br>Аллилуйя &amp; хвала');
      final lines = s.blocks.whereType<LineBlock>().map((b) => b.segments.single.text).toList();
      expect(lines, ['Слава Богу', 'Аллилуйя & хвала']);
    });

    test('лишние пустые строки схлопываются, края обрезаются', () {
      final s = parseSong('\n\nСлава\n\n\n\nБогу\n\n');
      expect(kinds(s), ['LineBlock', 'GapBlock', 'LineBlock']);
    });

    test('пустой и мусорный текст', () {
      expect(parseSong('').blocks, isEmpty);
      expect(parseSong('   \n \n').blocks, isEmpty);
      expect(parseSong('{title: x}').blocks, isEmpty);
    });

    test('Windows-переводы строк', () {
      final s = parseSong('{sec:Припев}\r\nСлава\r\nБогу');
      expect(kinds(s), ['SectionBlock', 'LineBlock', 'LineBlock']);
    });
  });

  group('H-нотация и ключевой аккорд', () {
    test('песня с H определяется', () {
      expect(parseSong('[H]Слава [A]Богу').usesH, isTrue);
      expect(parseSong('A  H7\nСлава Богу').usesH, isTrue);
      expect(parseSong('[A]Слава [E]Богу').usesH, isFalse);
    });

    test('первый аккорд — для определения тональности', () {
      expect(parseSong('Слава [Am]Богу [C]вам').firstChord, 'Am');
      expect(parseSong('Слава Богу').firstChord, isNull);
    });
  });

  group('текст без аккордов', () {
    test('для поиска и фрагментов', () {
      const raw = '{sec:Припев}\n[A]Бога благосло[E]ви, о, душа [H/D#]моя,\n\nA  E\nПой и превозноси!';
      expect(songPlainText(raw), 'Бога благослови, о, душа моя,\n\nПой и превозноси!');
    });
  });

  group('сдвиг аккордов на экране', () {
    test('аккорды двигаются, текст нет', () {
      final s = parseSong('{sec:Припев}\n[A]Бога благосло[E]ви, [H/D#]моя');
      final shifted = shiftBlocks(s, 2, preferFlats: false);
      final line = shifted[1] as LineBlock;
      expect(line.segments.map((x) => x.chordText), ['H', 'F#', 'C#/F'], reason: 'в песне есть H, значит натуральная си — H');
      expect(line.segments.map((x) => x.text).join(), 'Бога благослови, моя');
    });

    test('в песне с H аккорды двигаются как обычно', () {
      final up = shiftBlocks(parseSong('[G]Слава [H]Богу'), 1, preferFlats: false);
      expect((up[0] as LineBlock).segments.map((x) => x.chordText), ['G#', 'C']);
    });

    test('в песне с H одиночное B — си-бемоль', () {
      final up = shiftBlocks(parseSong('[B]Слава [H]Богу'), 2, preferFlats: true);
      expect((up[0] as LineBlock).segments.map((x) => x.chordText), ['C', 'Db']);
    });

    test('нулевой сдвиг возвращает исходные аккорды', () {
      final s = parseSong('[Bb]Слава [F#m]Богу');
      final line = shiftBlocks(s, 0, preferFlats: false).single as LineBlock;
      expect(line.segments.map((x) => x.chordText), ['Bb', 'F#m']);
    });
  });
}
