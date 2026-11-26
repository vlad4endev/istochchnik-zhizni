import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/bible/audio/bible_audio_player.dart';
import 'package:molitva/features/bible/data/book_catalog.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

void main() {
  late FakeBackend backend;
  late BiblePlayer player;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    backend = FakeBackend();
    player = BiblePlayer(backendFactory: () => backend);
  });

  tearDown(() => player.dispose());

  test('запуск главы: загрузка, скорость, воспроизведение; пауза и продолжение', () async {
    await player.playChapter(trackOf('john', 3));
    expect(backend.log, ['load:https://cdn/john3.mp3@0', 'speed:1.0', 'play']);
    expect(player.status, AudioStatus.playing);
    expect(player.isCurrent('synodal', 'john', 3), isTrue);
    expect(player.isCurrent('synodal', 'john', 4), isFalse);
    await player.toggle();
    expect(player.status, AudioStatus.paused);
    await player.toggle();
    expect(player.status, AudioStatus.playing);
    expect(backend.log.where((e) => e == 'play'), hasLength(2));
  });

  test('«слушать с этого стиха»: старт с секунды стиха из разметки; нет такого стиха — с начала', () async {
    await player.playChapter(trackOf('john', 3), fromVerse: 2);
    expect(backend.log.first, 'load:https://cdn/john3.mp3@10500');
    await player.playChapter(trackOf('john', 3), fromVerse: 99);
    expect(backend.log.where((e) => e.startsWith('load')).last, 'load:https://cdn/john3.mp3@0');
  });

  test('читаемый стих следует за временем и пропадает, когда ничего не играет', () async {
    await player.playChapter(trackOf('john', 3));
    backend.positionCtl.add(const Duration(seconds: 3));
    expect(player.activeVerse.value, 1);
    backend.positionCtl.add(const Duration(seconds: 12));
    expect(player.activeVerse.value, 2);
    expect(player.position.value, const Duration(seconds: 12));
    await player.close();
    expect(player.activeVerse.value, isNull);
    expect(player.isActive, isFalse);
    expect(player.status, AudioStatus.idle);
    expect(backend.log.last, 'stop');
  });

  test('перемотка не выходит за границы записи; ±15 секунд', () async {
    await player.playChapter(trackOf('john', 3));
    backend.positionCtl.add(const Duration(seconds: 100));
    await player.skipBy(const Duration(seconds: 15));
    expect(backend.log.last, 'seek:115');
    await player.skipBy(const Duration(seconds: 15));
    expect(backend.log.last, 'seek:120', reason: 'длина записи 120 с');
    backend.positionCtl.add(const Duration(seconds: 5));
    await player.skipBy(const Duration(seconds: -15));
    expect(backend.log.last, 'seek:0');
  });

  test('скорость: по кругу, запоминается и применяется к следующей главе', () async {
    await player.playChapter(trackOf('john', 3));
    await player.cycleRate();
    expect(player.rate, 1.25);
    expect(backend.log.last, 'speed:1.25');
    await player.setRate(3.0);
    expect(player.rate, 1.25, reason: 'неизвестная скорость игнорируется');

    final again = BiblePlayer(backendFactory: () => backend);
    addTearDown(again.dispose);
    await again.playChapter(trackOf('john', 4));
    expect(again.rate, 1.25, reason: 'выбор скорости пережил перезапуск');
  });

  test('автопереход в читалке: плеер просит читалку открыть следующую главу, сам ничего не грузит', () async {
    final asked = <String>[];
    player
      ..books = [for (final d in bibleBooks) BibleBook.fromDef(d)]
      ..navigator = (slug, chapter) => asked.add('$slug:$chapter');
    await player.playChapter(trackOf('john', 3));
    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(asked, ['john:4']);
    expect(player.status, AudioStatus.paused);
  });

  test('автопереход без читалки: загружает озвучку следующей главы и продолжает; конец Библии и нет записи — тишина', () async {
    final source = FakeBibleSource()..audioByChapter['john:4'] = audioFor('john4');
    player
      ..books = [for (final d in bibleBooks) BibleBook.fromDef(d)]
      ..source = source;
    await player.playChapter(trackOf('john', 3));
    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(player.track?.chapter, 4);
    expect(backend.log.where((e) => e.startsWith('load')).last, 'load:https://cdn/john4.mp3@0');
    expect(player.status, AudioStatus.playing);

    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(player.track?.chapter, 4, reason: 'для главы 5 записи нет — остаёмся на месте');
    expect(player.status, AudioStatus.paused);

    final last = bibleBooks.last;
    await player.playChapter(trackOf(last.slug, last.chapters));
    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(player.track?.bookSlug, last.slug, reason: 'после последней главы Библии идти некуда');
    expect(player.track?.chapter, last.chapters);
    expect(player.status, AudioStatus.paused);
  });

  test('автопереход выключен — после конца главы тишина', () async {
    final asked = <String>[];
    player
      ..books = [for (final d in bibleBooks) BibleBook.fromDef(d)]
      ..navigator = (slug, chapter) => asked.add('$slug:$chapter');
    await player.playChapter(trackOf('john', 3));
    await player.setAutoNext(false);
    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(asked, isEmpty);
    final again = BiblePlayer(backendFactory: () => backend);
    addTearDown(again.dispose);
    await again.playChapter(trackOf('john', 4));
    expect(again.autoNext, isFalse, reason: 'выбор запомнен');
  });

  test('таймер «до конца главы»: после главы стоп, автопереход не срабатывает, таймер сброшен', () async {
    final asked = <String>[];
    player
      ..books = [for (final d in bibleBooks) BibleBook.fromDef(d)]
      ..navigator = (slug, chapter) => asked.add('$slug:$chapter');
    await player.playChapter(trackOf('john', 3));
    player.sleepAtChapterEnd();
    expect(player.sleepKind, SleepKind.chapterEnd);
    backend.completedCtl.add(null);
    await pumpEventQueue();
    expect(asked, isEmpty);
    expect(player.sleepKind, SleepKind.off);
  });

  test('таймер на минуты: через N минут пауза; можно отменить', () {
    fakeAsync((async) {
      final t = DateTime(2026, 11, 26, 22);
      var now = t;
      final p = BiblePlayer(backendFactory: () => backend, clock: () => now);
      unawaited(p.playChapter(trackOf('john', 3)));
      async.flushMicrotasks();
      p.sleepInMinutes(10);
      expect(p.sleepKind, SleepKind.minutes);
      now = t.add(const Duration(minutes: 4));
      expect(p.sleepLeft, const Duration(minutes: 6));
      async.elapse(const Duration(minutes: 9));
      expect(p.status, AudioStatus.playing, reason: 'ещё не время');
      async.elapse(const Duration(minutes: 2));
      expect(p.status, AudioStatus.paused);
      expect(backend.log.last, 'pause');
      expect(p.sleepKind, SleepKind.off);

      p.sleepInMinutes(5);
      p.sleepOff();
      expect(p.sleepKind, SleepKind.off);
      expect(p.sleepLeft, Duration.zero);
      p.dispose();
    });
  });

  test('сбой загрузки: понятная причина, плеер не зависает в «загрузке»', () async {
    backend.failLoad = true;
    await player.playChapter(trackOf('john', 3));
    expect(player.problem, contains('Не удалось включить озвучку'));
    expect(player.status, AudioStatus.paused);
    player.clearProblem();
    expect(player.problem, isNull);
  });

  test('быстро включили другую главу: побеждает последняя, первая не перебивает', () async {
    backend.loadGate = Completer<void>();
    final first = player.playChapter(trackOf('john', 3));
    await pumpEventQueue();
    final gate = backend.loadGate!;
    backend.loadGate = null;
    await player.playChapter(trackOf('john', 4));
    gate.complete();
    await first;
    expect(player.track?.chapter, 4);
    expect(player.status, AudioStatus.playing);
  });
}
