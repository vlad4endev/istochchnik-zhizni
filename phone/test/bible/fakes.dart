import 'package:molitva/features/bible/data/bible_repository.dart';
import 'package:molitva/features/bible/data/book_catalog.dart';
import 'package:molitva/features/bible/models/bible_models.dart';

/// Источник без сети: считает запросы и может «потерять» связь.
class FakeBibleSource implements BibleSource {
  FakeBibleSource({this.online = true});

  bool online;
  int chapterCalls = 0;
  int searchCalls = 0;
  final savedPositions = <ReadingPosition>[];
  final notesStore = <BibleNote>[];
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
      verses: [for (var i = 1; i <= 5; i++) Verse(i, 'Стих $i главы $chapter')],
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
}
