import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/songbook/data/songbook_repository.dart';
import 'package:molitva/features/songbook/models/song.dart';
import 'package:molitva/features/songbook/reader_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Source implements SongbookSource {
  _Source(this.version);
  final SongVersion? version;
  @override
  Future<SongVersion?> studioVersion(int songId) async => version;
  @override
  Future<SongbookSnapshot?> readCache() async => null;
  @override
  Future<List<Song>> fetch() async => const [];
  @override
  Future<void> writeCache(List<Song> songs) async {}
  @override
  Future<void> setFavorite(int songId, bool value) async {}
  @override
  Future<void> recordOpened(int songId) async {}
}

const sample = '{sec:Припев}\n[A]Бога благосло[E]ви, о, душа [H/D#]моя,\n[A]Пой и [E]превозноси!';

Song song({String key = 'A', String content = sample, int id = 1, bool studio = false}) =>
    Song(id: id, title: '10 000 причин', key: key, content: content, hasStudioVersion: studio);

String chords(ReaderController c) => [
      for (final b in c.blocks)
        if (b.runtimeType.toString() == 'LineBlock') (b as dynamic).segments.map((s) => s.chordText).whereType<String>().join(' '),
    ].join(' / ');

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('без сдвига — аккорды как в тексте', () async {
    final c = ReaderController(song: song());
    await c.init();
    expect(c.soundingKey, 'A');
    expect(chords(c), 'A E H/D# / A E');
    expect(c.changed, isFalse);
    expect(c.hasChords, isTrue);
  });

  test('транспонирование: тональность и аккорды', () async {
    final c = ReaderController(song: song());
    await c.init();
    c.changeTranspose(2);
    expect(c.soundingKey, 'H', reason: 'в песне есть H');
    expect(chords(c), 'H F# C#/F / H F#');
    c.changeTranspose(-2);
    expect(chords(c), 'A E H/D# / A E');
  });

  test('каподастр: аккорды ниже, тональность та же; концертные — наоборот', () async {
    final c = ReaderController(song: song());
    await c.init();
    c.changeCapo(2);
    expect(c.soundingKey, 'A', reason: 'звучит всё в той же тональности');
    expect(chords(c), 'G D A/C# / G D', reason: 'каподастр 2: играем формы на тон ниже');
    c.setConcert(true);
    expect(chords(c), 'A E H/D# / A E');
    c.setConcert(false);
    c.changeCapo(-5);
    expect(c.capo, 0, reason: 'каподастр не уходит ниже нуля');
  });

  test('границы сдвига', () async {
    final c = ReaderController(song: song());
    await c.init();
    for (var i = 0; i < 20; i++) {
      c.changeTranspose(1);
    }
    expect(c.transpose, 11);
    for (var i = 0; i < 30; i++) {
      c.changeTranspose(-1);
    }
    expect(c.transpose, -11);
    for (var i = 0; i < 20; i++) {
      c.changeCapo(1);
    }
    expect(c.capo, 11);
  });

  test('сразу в выбранную тональность', () async {
    final c = ReaderController(song: song());
    await c.init();
    c.setSoundingKey('G');
    expect(c.transpose, -2);
    expect(c.soundingKey, 'G');
    c.setSoundingKey('C');
    expect(c.transpose, 3);
  });

  test('список тональностей для выбора — по высоте, 12 штук', () async {
    final c = ReaderController(song: song(key: 'Am', content: '[Am]Слава [C]Богу'));
    await c.init();
    final keys = c.keyChoices();
    expect(keys.length, 12);
    expect(keys.first, 'Cm');
    expect(keys, containsAll(['Am', 'Dm', 'Em']));
  });

  test('бемоли в бемольных тональностях', () async {
    final c = ReaderController(song: song(key: 'C', content: '[C]Слава [G]Богу [F]всем'));
    await c.init();
    c.changeTranspose(5); // F-мажор
    expect(c.soundingKey, 'F');
    expect(chords(c), 'F C Bb');
  });

  test('песня без указанной тональности: бейдж пустой, сдвиг работает', () async {
    final c = ReaderController(song: Song(id: 2, title: 'Т', content: '[Am]Слава [C]Богу'));
    await c.init();
    expect(c.declaredKey, isNull);
    expect(c.soundingKey, isNull);
    c.changeTranspose(2);
    expect(chords(c), 'Bm D');
    expect(c.keyChoices(), isEmpty);
  });

  test('песня без аккордов', () async {
    final c = ReaderController(song: song(content: 'Просто слова\nбез аккордов'));
    await c.init();
    expect(c.hasChords, isFalse);
  });

  group('запоминание', () {
    test('сдвиг и каподастр запоминаются для песни', () async {
      final a = ReaderController(song: song());
      await a.init();
      a.changeTranspose(3);
      a.changeCapo(1);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final b = ReaderController(song: song());
      await b.init();
      expect(b.transpose, 3);
      expect(b.capo, 1);
      final other = ReaderController(song: song(id: 99));
      await other.init();
      expect(other.transpose, 0);
    });

    test('сброс возвращает оригинал и забывает', () async {
      final a = ReaderController(song: song());
      await a.init();
      a.changeTranspose(3);
      a.resetSong();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final b = ReaderController(song: song());
      await b.init();
      expect(b.transpose, 0);
      expect(b.changed, isFalse);
    });

    test('настройки чтения общие для всех песен', () async {
      final a = ReaderController(song: song());
      await a.init();
      a.setTheme(ReaderTheme.light);
      a.setFontSize(28);
      a.setShowChords(false);
      a.setScrollSpeed(5);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final b = ReaderController(song: song(id: 7));
      await b.init();
      expect(b.settings.theme, ReaderTheme.light);
      expect(b.settings.fontSize, 28);
      expect(b.settings.showChords, isFalse);
      expect(b.settings.scrollSpeed, 5);
    });

    test('шрифт и скорость не выходят за границы', () {
      const s = ReaderSettings();
      expect(s.copyWith(fontSize: 500).fontSize, ReaderSettings.maxFont);
      expect(s.copyWith(fontSize: 1).fontSize, ReaderSettings.minFont);
      expect(s.copyWith(scrollSpeed: 99).scrollSpeed, ReaderSettings.speeds);
    });

    test('повреждённые сохранённые настройки не ломают открытие', () async {
      SharedPreferences.setMockInitialValues({'reader_settings': '{не json', 'reader_song_prefs': '[]'});
      final c = ReaderController(song: song());
      await c.init();
      expect(c.ready, isTrue);
      expect(c.settings.fontSize, 22);
    });
  });

  test('моя версия из студии подменяет текст и тональность', () async {
    final c = ReaderController(
      song: song(studio: true),
      source: _Source(const SongVersion(content: '[G]Моя [D]версия', key: 'G')),
    );
    await c.init();
    await c.loadMyVersion();
    expect(c.usingMyVersion, isTrue);
    expect(c.declaredKey, 'G');
    expect(chords(c), 'G D');
  });

  test('без версии в студии запрос не нужен', () async {
    final c = ReaderController(song: song(), source: _Source(const SongVersion(content: 'x')));
    await c.init();
    await c.loadMyVersion();
    expect(c.usingMyVersion, isFalse);
  });
}
