import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/songbook/logic/song_search.dart';
import 'package:molitva/features/songbook/models/song.dart';

Song song(int id, String title, {int? number, String content = '', String? key, List<String> tags = const [], int? tempo}) =>
    Song(id: id, number: number, title: title, content: content, key: key, tags: tags, tempo: tempo);

void main() {
  final songs = [
    song(1, '10 000 причин', number: 1, key: 'A', tags: ['Хвала'], content: '{sec:Припев}\n[A]Бога благосло[E]ви, о, душа моя,\n[A]Пой и превозноси!'),
    song(2, 'Благословлю Тебя', number: 12, key: 'G', tags: ['Поклонение'], content: 'Я благословлю Тебя, Господь,\nВо все дни'),
    song(3, 'Агнец Божий', number: 7, key: 'Am', tags: ['Поклонение', 'Причастие'], content: 'Достоин Агнец заклан\nПринять силу'),
    song(4, 'Ёлка во поле', number: 45, key: 'F#m', tags: ['Детские'], content: 'Лёгкий свет озарил'),
    song(5, 'Неизвестная', key: null, tags: ['__служебный', 'нет_текста'], content: ''),
  ];
  final index = SongIndex(songs);

  List<int> ids(String q) => index.search(q).map((h) => h.song.id).toList();

  group('нормализация', () {
    test('регистр, ё и знаки препинания', () {
      expect(foldForSearch('Ёлка, ВО поле!'), 'елка  во поле ');
      expect(foldForSearch('Лёгкий'), 'легкий');
    });

    test('слова запроса', () {
      expect(queryTokens('  Благо  слови, '), ['благо', 'слови']);
      expect(queryTokens('   '), isEmpty);
    });
  });

  group('поиск', () {
    test('по части слова — без полного совпадения', () {
      expect(ids('благо'), containsAll([2, 1]));
    });

    test('по названию выше, чем по тексту', () {
      expect(ids('благословлю').first, 2);
      // «благосл» есть в названии песни 2 и в тексте песни 1 (благослови) — название выше.
      expect(ids('благосл').first, 2);
    });

    test('ё и е равны в обе стороны', () {
      expect(ids('елка'), [4]);
      expect(ids('ёлка'), [4]);
      expect(ids('легкий'), [4]);
    });

    test('несколько слов — все должны найтись, порядок не важен', () {
      expect(ids('душа бога'), [1]);
      expect(ids('тебя благо'), [2]);
      expect(ids('душа тебя'), isEmpty);
    });

    test('по строчке из песни', () {
      expect(ids('превозноси'), [1]);
      expect(ids('достоин агнец'), [3]);
    });

    test('аккорды в тексте поиск не сбивают', () {
      expect(ids('благословиоду'), isEmpty);
      expect(ids('благослови о'), [1]);
    });

    test('по номеру', () {
      expect(ids('12'), [2]);
      expect(ids('45'), [4]);
      expect(ids('7').first, 3);
    });

    test('по тональности', () {
      expect(ids('Am'), [3]);
      expect(ids('f#m'), [4]);
      expect(ids('G'), [2]);
    });

    test('по тегу, служебные теги не ищутся', () {
      expect(ids('причастие'), [3]);
      expect(ids('поклонение'), unorderedEquals([2, 3]));
      expect(ids('служебный'), isEmpty);
      expect(ids('нет_текста'), isEmpty);
    });

    test('точная тональность выше совпадения по началу названия', () {
      final idx = SongIndex([song(1, 'Amazing', key: 'D'), song(2, 'Утренняя', key: 'Am')]);
      expect(idx.search('Am').map((h) => h.song.id), [2, 1]);
    });

    test('пустой запрос — нет результатов поиска', () {
      expect(ids(''), isEmpty);
      expect(ids('  '), isEmpty);
    });
  });

  group('подсветка и цитата', () {
    test('совпадение в названии подсвечивается в названии', () {
      final hit = index.search('агнец').first;
      expect(hit.titleMarks.map((r) => 'Агнец Божий'.substring(r.start, r.end)), ['Агнец']);
      expect(hit.snippet, isNull, reason: 'цитата нужна только если в названии не нашлось');
    });

    test('совпадение в теге подсвечивается в строке тегов', () {
      final hit = index.search('причастие').single;
      final line = tagsLine(hit.song);
      expect(hit.tagMarks.map((r) => line.substring(r.start, r.end)), ['Причастие']);
      expect(hit.snippet, isNull);
    });

    test('совпадение только в тексте даёт цитату строки', () {
      final hit = index.search('превозноси').single;
      expect(hit.snippet!.text, 'Пой и превозноси!');
      expect(hit.snippet!.marks.map((r) => hit.snippet!.text.substring(r.start, r.end)), ['превозноси']);
    });

    test('длинная строка обрезается вокруг совпадения', () {
      final long = '${'слово ' * 20}искомое${' слово' * 20}';
      final hit = SongIndex([song(9, 'Длинная', content: long)]).search('искомое').single;
      expect(hit.snippet!.text.length, lessThan(long.length));
      expect(hit.snippet!.text, contains('искомое'));
      expect(hit.snippet!.text.startsWith('…'), isTrue);
      expect(hit.snippet!.text.endsWith('…'), isTrue);
      expect(hit.snippet!.marks.map((r) => hit.snippet!.text.substring(r.start, r.end)), ['искомое']);
    });

    test('у ё-совпадения диапазон попадает на нужные буквы', () {
      final hit = index.search('легкий').single;
      expect(hit.snippet!.text.substring(hit.snippet!.marks.first.start, hit.snippet!.marks.first.end), 'Лёгкий');
    });
  });

  group('фильтры и сортировка', () {
    final filters = SongFilters();

    test('избранное, теги, тональности, темп', () {
      final list = [
        song(1, 'А', key: 'A', tags: ['Хвала'], tempo: 120).copyWith(favorite: true),
        song(2, 'Б', key: 'G', tags: ['Поклонение'], tempo: 60),
        song(3, 'В', key: 'A', tags: ['Хвала', 'Поклонение'], tempo: 90),
      ];
      expect(SongFilters(favoritesOnly: true).apply(list).map((s) => s.id), [1]);
      expect(SongFilters(tags: {'Хвала'}).apply(list).map((s) => s.id), [1, 3]);
      expect(SongFilters(tags: {'Хвала', 'Поклонение'}).apply(list).map((s) => s.id), [1, 2, 3], reason: 'теги — «или»');
      expect(SongFilters(keys: {'A'}).apply(list).map((s) => s.id), [1, 3]);
      expect(SongFilters(tempo: TempoBand.slow).apply(list).map((s) => s.id), [2]);
      expect(SongFilters(tempo: TempoBand.medium).apply(list).map((s) => s.id), [3]);
      expect(SongFilters(tempo: TempoBand.fast).apply(list).map((s) => s.id), [1]);
      expect(SongFilters(keys: {'A'}, tags: {'Поклонение'}).apply(list).map((s) => s.id), [3], reason: 'разные фильтры — «и»');
      expect(filters.isEmpty, isTrue);
      expect(SongFilters(keys: {'A'}).activeCount, 1);
    });

    test('сортировка: по алфавиту без учёта регистра и ё, по номеру', () {
      final list = [
        song(1, 'яблоко', number: 3),
        song(2, 'Ёлка', number: 1),
        song(3, 'Агнец', number: null),
        song(4, 'Благодать', number: 2),
      ];
      expect(sortSongs(list, SongSort.alphabetical).map((s) => s.title), ['Агнец', 'Благодать', 'Ёлка', 'яблоко']);
      expect(sortSongs(list, SongSort.number).map((s) => s.title), ['Ёлка', 'Благодать', 'яблоко', 'Агнец'], reason: 'без номера — в конец');
    });

    test('буква группы', () {
      expect(groupLetter('агнец'), 'А');
      expect(groupLetter('Ёлка'), 'Е', reason: 'Ё сортируется вместе с Е');
      expect(groupLetter('10 000 причин'), '#');
      expect(groupLetter('Amazing Grace'), '#', reason: 'латинская A неотличима от русской А');
      expect(groupLetter('«Слава»'), 'С');
      expect(groupLetter(''), '#');
    });
  });
}
