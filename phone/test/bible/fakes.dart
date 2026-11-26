import 'dart:async';

import 'package:molitva/features/bible/audio/audio_backend.dart';
import 'package:molitva/features/bible/audio/bible_audio_player.dart';
import 'package:molitva/features/bible/data/bible_repository.dart';
import 'package:molitva/features/bible/data/book_catalog.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:molitva/features/bible/models/plan_models.dart';

/// Источник без сети: считает запросы и может «потерять» связь.
class FakeBibleSource implements BibleSource {
  FakeBibleSource({this.online = true});

  bool online;
  int chapterCalls = 0;
  int searchCalls = 0;
  final savedPositions = <ReadingPosition>[];
  final notesStore = <BibleNote>[];
  final bookmarkStore = <BibleBookmark>[];
  final audioByChapter = <String, BibleAudio>{};
  final commentaryList = <BibleCommentary>[];
  final planStore = <BiblePlan>[];
  final audioCalls = <String>[];

  /// Сколько стихов в каждой главе, которую отдаёт источник.
  int versesPerChapter = 5;
  int _bookmarkId = 1;
  int _planId = 1;
  ReadingPosition? remotePosition;
  List<BibleTranslation> translationList = const [
    BibleTranslation.synodal,
    BibleTranslation(code: 'nt', title: 'Новый Завет', shortTitle: 'НЗ', newTestamentOnly: true, verseCount: 10),
  ];
  List<VerseHit> searchResult = const [];
  int _noteId = 1;

  void _need() {
    if (!online) throw Exception('нет сети');
  }

  @override
  Future<List<BibleTranslation>> translations() async => translationList;

  @override
  Future<List<BibleBook>> books(String translation) async => [
        for (final def in bibleBooks)
          if (translation != 'nt' || def.isNewTestament) BibleBook.fromDef(def),
      ];

  @override
  Future<ChapterText> chapter(String translation, String bookSlug, int chapter) async {
    chapterCalls++;
    _need();
    return ChapterText(
      translation: translation,
      bookSlug: bookSlug,
      chapter: chapter,
      verses: [for (var i = 1; i <= versesPerChapter; i++) Verse(i, 'Стих $i главы $chapter')],
    );
  }

  @override
  Future<List<VerseHit>> search(String translation, String query) async {
    searchCalls++;
    _need();
    return searchResult;
  }

  @override
  Future<ReadingPosition?> serverPosition(String translation) async => remotePosition;

  @override
  Future<void> saveServerPosition(ReadingPosition position) async => savedPositions.add(position);

  @override
  Future<List<BibleNote>> notes({String? translation, String? bookSlug, int? chapter}) async {
    _need();
    return [
      for (final n in notesStore)
        if (bookSlug == null || (n.bookSlug == bookSlug && n.chapter == chapter)) n,
    ];
  }

  @override
  Future<BibleNote> createNote({
    required String translation,
    required String bookSlug,
    required int chapter,
    required int verseStart,
    required int verseEnd,
    required String body,
  }) async {
    _need();
    final note = BibleNote(
      id: _noteId++,
      translation: translation,
      bookSlug: bookSlug,
      bookName: bookSlug,
      shortName: bookSlug,
      chapter: chapter,
      verseStart: verseStart,
      verseEnd: verseEnd,
      body: body,
      updatedAt: DateTime.now(),
    );
    notesStore.add(note);
    return note;
  }

  @override
  Future<BibleNote> updateNote(int id, String body) async {
    _need();
    final old = notesStore.firstWhere((n) => n.id == id);
    final next = BibleNote(
      id: id,
      translation: old.translation,
      bookSlug: old.bookSlug,
      bookName: old.bookName,
      shortName: old.shortName,
      chapter: old.chapter,
      verseStart: old.verseStart,
      verseEnd: old.verseEnd,
      body: body,
      updatedAt: DateTime.now(),
    );
    notesStore[notesStore.indexOf(old)] = next;
    return next;
  }

  @override
  Future<void> deleteNote(int id) async {
    _need();
    notesStore.removeWhere((n) => n.id == id);
  }

  @override
  Future<List<BibleBookmark>> bookmarks({String? translation, String? bookSlug, int? chapter}) async {
    _need();
    return [
      for (final b in bookmarkStore)
        if (bookSlug == null || (b.bookSlug == bookSlug && b.chapter == chapter)) b,
    ];
  }

  @override
  Future<BibleBookmark> createBookmark({
    required String translation,
    required String bookSlug,
    required int chapter,
    required int verseStart,
    required int verseEnd,
  }) async {
    _need();
    final def = bibleBooks.firstWhere((b) => b.slug == bookSlug);
    final bookmark = BibleBookmark(
      id: _bookmarkId++,
      translation: translation,
      bookSlug: bookSlug,
      bookName: def.name,
      shortName: def.shortName,
      chapter: chapter,
      verseStart: verseStart,
      verseEnd: verseEnd,
      createdAt: DateTime.now(),
    );
    bookmarkStore.add(bookmark);
    return bookmark;
  }

  @override
  Future<void> deleteBookmark(int id) async {
    _need();
    bookmarkStore.removeWhere((b) => b.id == id);
  }

  @override
  Future<BibleAudio?> audio(String translation, String bookSlug, int chapter) async {
    audioCalls.add('$bookSlug:$chapter');
    _need();
    return audioByChapter['$bookSlug:$chapter'];
  }

  @override
  Future<List<BibleCommentary>> commentaries(String translation, String bookSlug, int chapter) async {
    _need();
    return commentaryList;
  }

  @override
  Future<List<BiblePlan>> plans() async {
    _need();
    return [for (final p in planStore) BiblePlan(id: p.id, title: p.title, goal: p.goal, daysTotal: p.daysTotal, daysCompleted: p.daysCompleted)];
  }

  @override
  Future<BiblePlan> plan(int id) async {
    _need();
    return planStore.firstWhere((p) => p.id == id);
  }

  @override
  Future<BiblePlan> generatePlan({required String goal, required int days, DateTime? startDate}) async {
    _need();
    final id = _planId++;
    final plan = BiblePlan(
      id: id,
      title: 'План: $goal',
      goal: goal,
      daysTotal: days,
      daysCompleted: 0,
      days: [
        for (var i = 1; i <= days; i++)
          BiblePlanDay(id: id * 100 + i, dayIndex: i, label: 'День $i', refs: [PlanRef(bookSlug: 'john', chapter: i.clamp(1, 21))]),
      ],
    );
    planStore.add(plan);
    return plan;
  }

  @override
  Future<void> setPlanDay(int planId, int dayIndex, {required bool done}) async {
    _need();
    final i = planStore.indexWhere((p) => p.id == planId);
    final plan = planStore[i];
    planStore[i] = plan.withDays([for (final d in plan.days) d.dayIndex == dayIndex ? d.copyWith(done: done) : d]);
  }

  @override
  Future<void> deletePlan(int id) async {
    _need();
    planStore.removeWhere((p) => p.id == id);
  }
}

/// Движок без звука: записывает команды, а «время» и «конец записи» подаёт тест.
class FakeBackend implements AudioBackend {
  final positionCtl = StreamController<Duration>.broadcast(sync: true);
  final durationCtl = StreamController<Duration?>.broadcast(sync: true);
  final playingCtl = StreamController<bool>.broadcast(sync: true);
  final completedCtl = StreamController<void>.broadcast(sync: true);
  final log = <String>[];
  bool failLoad = false;
  Completer<void>? loadGate;

  @override
  Stream<Duration> get position => positionCtl.stream;
  @override
  Stream<Duration?> get duration => durationCtl.stream;
  @override
  Stream<bool> get playing => playingCtl.stream;
  @override
  Stream<void> get completed => completedCtl.stream;

  @override
  Future<void> load(String url, {Duration start = Duration.zero}) async {
    log.add('load:$url@${start.inMilliseconds}');
    if (loadGate != null) await loadGate!.future;
    if (failLoad) throw Exception('нет сети');
    durationCtl.add(const Duration(seconds: 120));
  }

  @override
  Future<void> play() async {
    log.add('play');
    playingCtl.add(true);
  }

  @override
  Future<void> pause() async {
    log.add('pause');
    playingCtl.add(false);
  }

  @override
  Future<void> seek(Duration to) async => log.add('seek:${to.inSeconds}');

  @override
  Future<void> setSpeed(double speed) async => log.add('speed:$speed');

  @override
  Future<void> stop() async => log.add('stop');

  @override
  Future<void> dispose() async {}
}

BibleAudio audioFor(String name, {List<VerseTiming>? timings}) => BibleAudio(
      url: 'https://cdn/$name.mp3',
      timings: timings ?? const [VerseTiming(verse: 1, start: 0, end: 10), VerseTiming(verse: 2, start: 10.5, end: 20)],
    );

BibleTrack trackOf(String slug, int chapter, {BibleAudio? audio}) {
  final def = bibleBooks.firstWhere((b) => b.slug == slug);
  return BibleTrack(
    translation: 'synodal',
    translationTitle: 'Синод.',
    bookSlug: slug,
    bookName: def.name,
    chapter: chapter,
    audio: audio ?? audioFor('$slug$chapter'),
  );
}

