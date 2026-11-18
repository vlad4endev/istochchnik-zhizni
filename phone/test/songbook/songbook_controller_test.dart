import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/songbook/data/songbook_repository.dart';
import 'package:molitva/features/songbook/logic/song_search.dart';
import 'package:molitva/features/songbook/models/song.dart';
import 'package:molitva/features/songbook/songbook_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeSource implements SongbookSource {
  FakeSource({this.cache, this.songs = const [], this.failFetch = false, this.failFavorite = false});

  SongbookSnapshot? cache;
  List<Song> songs;
  bool failFetch;
  bool failFavorite;
  final favoriteCalls = <String>[];
  int cacheWrites = 0;

  @override
  Future<SongbookSnapshot?> readCache() async => cache;

  @override
  Future<List<Song>> fetch() async {
    if (failFetch) throw Exception('нет сети');
    return songs;
  }

  @override
  Future<void> writeCache(List<Song> value) async => cacheWrites++;

  @override
  Future<void> setFavorite(int id, bool value) async {
    favoriteCalls.add('$id:$value');
    if (failFavorite) throw Exception('нет сети');
  }

  @override
  Future<void> recordOpened(int id) async {}

  @override
  Future<SongVersion?> studioVersion(int id) async => null;
}

Song s(int id, String title, {int? n, String? key, List<String> tags = const [], bool fav = false, String content = ''}) =>
    Song(id: id, title: title, number: n, key: key, tags: tags, favorite: fav, content: content);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final list = [
    s(1, 'Благодарю Тебя', n: 2, key: 'Am', tags: ['Хвала'], content: 'Слава Богу всегда'),
    s(2, 'Агнец Божий', n: 1, key: 'E', tags: ['Поклонение']),
    s(3, 'Бог мой храни меня', n: 3, key: 'D', tags: ['Хвала', 'Поклонение'], fav: true),
    s(4, '10 000 причин', n: 4, key: 'A', tags: ['Хвала']),
  ];

  test('загрузка: данные, группы по буквам, «#» первым', () async {
    final c = SongbookController(FakeSource(songs: list));
    await c.load();
    expect(c.loading, isFalse);
    expect(c.error, isNull);
    expect(c.total, 4);
    expect(c.groups.map((g) => g.letter), ['#', 'А', 'Б']);
    expect(c.groups.last.songs.map((x) => x.title), ['Благодарю Тебя', 'Бог мой храни меня']);
    expect(c.favoriteCount, 1);
  });

  test('сохранённая копия показывается сразу, если сети нет', () async {
    final c = SongbookController(FakeSource(cache: SongbookSnapshot(list, DateTime(2026, 11, 10)), failFetch: true));
    await c.load();
    expect(c.hasSongs, isTrue);
    expect(c.error, isNull, reason: 'есть что показать — это не ошибка');
    expect(c.staleSince, DateTime(2026, 11, 10));
  });

  test('нет ни копии, ни сети — ошибка', () async {
    final c = SongbookController(FakeSource(failFetch: true));
    await c.load();
    expect(c.hasSongs, isFalse);
    expect(c.error, isNotNull);
    expect(c.loading, isFalse);
  });

  test('свежие данные стирают отметку «устарело» и обновляют копию', () async {
    final source = FakeSource(cache: SongbookSnapshot(list.take(2).toList(), DateTime(2026, 11, 10)), songs: list);
    final c = SongbookController(source);
    await c.load();
    expect(c.total, 4);
    expect(c.staleSince, isNull);
    expect(source.cacheWrites, 1);
  });

  test('поиск: результаты по релевантности, фильтры сужают поиск', () async {
    final c = SongbookController(FakeSource(songs: list));
    await c.load();
    c.setQuery('бог');
    expect(c.searching, isTrue);
    expect(c.hits.map((h) => h.song.id), unorderedEquals([3, 1]), reason: '«Божий» — не «бог»; песня 1 нашлась по тексту');
    c.toggleTag('Хвала');
    expect(c.hits.map((h) => h.song.id), unorderedEquals([1, 3]));
    c.setQuery('');
    expect(c.searching, isFalse);
    expect(c.hits, isEmpty);
    expect(c.shownCount, 3);
  });

  test('фильтры: избранное, теги переключаются, «все» сбрасывает', () async {
    final c = SongbookController(FakeSource(songs: list));
    await c.load();
    c.toggleFavoritesOnly();
    expect(c.shownCount, 1);
    c.toggleFavoritesOnly();
    c.toggleTag('Поклонение');
    expect(c.shownCount, 2);
    c.toggleTag('Поклонение');
    expect(c.filters.isEmpty, isTrue);
    c.setFilters(const SongFilters(keys: {'A'}));
    expect(c.shownCount, 1);
    c.clearFilters();
    expect(c.shownCount, 4);
  });

  test('теги и тональности для чипов и окна фильтров', () async {
    final c = SongbookController(FakeSource(songs: list));
    await c.load();
    expect(c.tags.first.name, 'Хвала');
    expect(c.tags.first.count, 3);
    expect(c.keys.map((k) => k.name), ['D', 'E', 'A', 'Am'], reason: 'по высоте от До, мажор перед минором');
    expect(c.countFor(const SongFilters(keys: {'A', 'E'})), 2);
  });

  test('сортировка по номеру — плоский список и запоминается', () async {
    final c = SongbookController(FakeSource(songs: list));
    await c.load();
    await c.setSort(SongSort.number);
    expect(c.groups, isEmpty);
    expect(c.flat.map((x) => x.number), [1, 2, 3, 4]);
    final again = SongbookController(FakeSource(songs: list));
    await again.load();
    expect(again.sort, SongSort.number);
  });

  group('избранное', () {
    test('сердечко меняется сразу и отправляется на сервер', () async {
      final source = FakeSource(songs: list);
      final c = SongbookController(source);
      await c.load();
      final error = await c.toggleFavorite(list[0]);
      expect(error, isNull);
      expect(c.current(list[0]).favorite, isTrue);
      expect(source.favoriteCalls, ['1:true']);
      expect(c.favoriteCount, 2);
    });

    test('снять избранное', () async {
      final source = FakeSource(songs: list);
      final c = SongbookController(source);
      await c.load();
      await c.toggleFavorite(list[2]);
      expect(c.current(list[2]).favorite, isFalse);
      expect(source.favoriteCalls, ['3:false']);
    });

    test('не получилось — сердечко возвращается и есть текст ошибки', () async {
      final source = FakeSource(songs: list, failFavorite: true);
      final c = SongbookController(source);
      await c.load();
      final error = await c.toggleFavorite(list[0]);
      expect(error, contains('Не удалось'));
      expect(c.current(list[0]).favorite, isFalse);
      expect(c.favoriteCount, 1);
    });

    test('поиск и вкладка «Избранное» видят новое избранное', () async {
      final c = SongbookController(FakeSource(songs: list));
      await c.load();
      c.toggleFavoritesOnly();
      expect(c.shownCount, 1);
      await c.toggleFavorite(list[1]);
      expect(c.shownCount, 2);
    });

    test('песня вне каталога (из сетлиста) в избранное не попадает', () async {
      final c = SongbookController(FakeSource(songs: list));
      await c.load();
      expect(await c.toggleFavorite(const Song.adHoc(title: 'X', content: '')), isNull);
      expect(c.favoriteCount, 1);
    });
  });
}
