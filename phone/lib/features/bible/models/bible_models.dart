import '../../../core/json.dart';
import '../data/book_catalog.dart';
import '../logic/bible_ref.dart';

class BibleTranslation {
  const BibleTranslation({
    required this.code,
    required this.title,
    required this.shortTitle,
    this.description = '',
    this.year,
    this.newTestamentOnly = false,
    this.licenseRequired = false,
    this.verseCount,
  });

  final String code;
  final String title;
  final String shortTitle;
  final String description;
  final String? year;
  final bool newTestamentOnly;
  final bool licenseRequired;

  /// null — сервер не сообщил; 0 — текст ещё не загружен.
  final int? verseCount;

  bool get hasText => !licenseRequired && (verseCount == null || verseCount! > 0);

  static const synodal = BibleTranslation(code: 'synodal', title: 'Синодальный перевод', shortTitle: 'Синод.', year: '1876');

  factory BibleTranslation.fromJson(Map<String, dynamic> json) {
    final count = json['verse_count'];
    return BibleTranslation(
      code: str(json['code']),
      title: str(json['title']),
      shortTitle: str(json['short_title']).isEmpty ? str(json['code']) : str(json['short_title']),
      description: str(json['description']),
      year: str(json['year']).isEmpty ? null : str(json['year']),
      newTestamentOnly: str(json['scope']) == 'nt',
      licenseRequired: str(json['availability']) == 'license_required',
      verseCount: count == null ? null : asInt(count),
    );
  }

  Map<String, dynamic> toJson() => {
        'code': code,
        'title': title,
        'short_title': shortTitle,
        'description': description,
        'year': year,
        'scope': newTestamentOnly ? 'nt' : 'full',
        'availability': licenseRequired ? 'license_required' : 'available',
        'verse_count': verseCount,
      };
}

class BibleBook {
  const BibleBook({
    required this.slug,
    required this.name,
    required this.shortName,
    required this.chapters,
    required this.isNewTestament,
  });

  final String slug;
  final String name;
  final String shortName;
  final int chapters;
  final bool isNewTestament;

  factory BibleBook.fromDef(BookDef def) => BibleBook(
        slug: def.slug,
        name: def.name,
        shortName: def.shortName,
        chapters: def.chapters,
        isNewTestament: def.isNewTestament,
      );

  factory BibleBook.fromJson(Map<String, dynamic> json) {
    final slug = str(json['slug']);
    final def = bookBySlug(slug);
    final short = str(json['short_name']);
    final chapters = asInt(json['chapters_count']);
    return BibleBook(
      slug: slug,
      name: str(json['name']).isEmpty ? (def?.name ?? slug) : str(json['name']),
      shortName: short.isEmpty ? (def?.shortName ?? str(json['name'])) : short,
      chapters: chapters > 0 ? chapters : (def?.chapters ?? 1),
      isNewTestament: str(json['testament']) == 'nt',
    );
  }

  Map<String, dynamic> toJson() => {
        'slug': slug,
        'name': name,
        'short_name': shortName,
        'chapters_count': chapters,
        'testament': isNewTestament ? 'nt' : 'ot',
      };
}

class Verse {
  const Verse(this.number, this.text);
  final int number;
  final String text;
}

class ChapterText {
  const ChapterText({required this.translation, required this.bookSlug, required this.chapter, required this.verses});

  final String translation;
  final String bookSlug;
  final int chapter;
  final List<Verse> verses;

  factory ChapterText.fromJson(Map<String, dynamic> json, {required String translation, required String bookSlug, required int chapter}) {
    return ChapterText(
      translation: translation,
      bookSlug: bookSlug,
      chapter: chapter,
      verses: [
        for (final raw in asList(json['verses']))
          if (asInt(asMap(raw)['verse']) > 0) Verse(asInt(asMap(raw)['verse']), str(asMap(raw)['text']).trim()),
      ],
    );
  }

  Map<String, dynamic> toJson() => {
        'verses': [for (final v in verses) {'verse': v.number, 'text': v.text}],
      };
}

class BibleNote {
  const BibleNote({
    required this.id,
    required this.translation,
    required this.bookSlug,
    required this.bookName,
    required this.shortName,
    required this.chapter,
    required this.verseStart,
    required this.verseEnd,
    required this.body,
    required this.updatedAt,
  });

  final int id;
  final String translation;
  final String bookSlug;
  final String bookName;
  final String shortName;
  final int chapter;
  final int verseStart;
  final int verseEnd;
  final String body;
  final DateTime? updatedAt;

  String get reference {
    final base = '$shortName $chapter:$verseStart';
    return verseEnd > verseStart ? '$base–$verseEnd' : base;
  }

  bool covers(int verse) => verse >= verseStart && verse <= verseEnd;

  factory BibleNote.fromJson(Map<String, dynamic> json) {
    final start = asInt(json['verse_start']);
    final end = asInt(json['verse_end']);
    final slug = str(json['book_slug']);
    final def = bookBySlug(slug);
    return BibleNote(
      id: asInt(json['id']),
      translation: str(json['translation_code']).isEmpty ? 'synodal' : str(json['translation_code']),
      bookSlug: slug,
      bookName: str(json['book_name']).isEmpty ? (def?.name ?? slug) : str(json['book_name']),
      shortName: str(json['short_name']).isEmpty ? (def?.shortName ?? slug) : str(json['short_name']),
      chapter: asInt(json['chapter']),
      verseStart: start < 1 ? 1 : start,
      verseEnd: end < start ? start : end,
      body: str(json['body']),
      updatedAt: DateTime.tryParse(str(json['updated_at'])),
    );
  }
}

/// Где человек остановился: показываем «Продолжить чтение».
class ReadingPosition {
  const ReadingPosition({required this.translation, required this.bookSlug, required this.chapter, this.verse = 1, this.savedAt});

  final String translation;
  final String bookSlug;
  final int chapter;
  final int verse;
  final DateTime? savedAt;

  BookDef? get book => bookBySlug(bookSlug);

  String get label => '${book?.shortName ?? bookSlug} $chapter';

  Map<String, dynamic> toJson() => {
        'translation': translation,
        'book': bookSlug,
        'chapter': chapter,
        'verse': verse,
        'at': savedAt?.toIso8601String(),
      };

  static ReadingPosition? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final json = asMap(raw);
    final slug = str(json['book']);
    final chapter = asInt(json['chapter']);
    if (bookBySlug(slug) == null || chapter < 1) return null;
    return ReadingPosition(
      translation: str(json['translation']).isEmpty ? 'synodal' : str(json['translation']),
      bookSlug: slug,
      chapter: chapter,
      verse: asInt(json['verse']) < 1 ? 1 : asInt(json['verse']),
      savedAt: DateTime.tryParse(str(json['at'])),
    );
  }

  /// Ответ сервера GET /api/bible/progress.
  static ReadingPosition? fromServer(Object? raw, String translation) {
    if (raw is! Map) return null;
    final json = asMap(raw);
    return fromJson({
      'translation': translation,
      'book': json['book_slug'],
      'chapter': json['chapter'],
      'verse': json['verse'],
      'at': json['updated_at'],
    });
  }
}

class VerseHit {
  const VerseHit({required this.bookSlug, required this.shortName, required this.chapter, required this.verse, required this.text});

  final String bookSlug;
  final String shortName;
  final int chapter;
  final int verse;
  final String text;

  String get reference => '$shortName $chapter:$verse';

  factory VerseHit.fromJson(Map<String, dynamic> json) {
    final slug = str(json['book_slug']);
    final short = str(json['short_name']);
    return VerseHit(
      bookSlug: slug,
      shortName: short.isEmpty ? (bookBySlug(slug)?.shortName ?? slug) : short,
      chapter: asInt(json['chapter']),
      verse: asInt(json['verse']),
      text: str(json['text']).trim(),
    );
  }
}

/// Закладка на стих или диапазон стихов (общая с веб-версией).
class BibleBookmark {
  const BibleBookmark({
    required this.id,
    required this.translation,
    required this.bookSlug,
    required this.bookName,
    required this.shortName,
    required this.chapter,
    required this.verseStart,
    required this.verseEnd,
    required this.createdAt,
  });

  final int id;
  final String translation;
  final String bookSlug;
  final String bookName;
  final String shortName;
  final int chapter;
  final int verseStart;
  final int verseEnd;
  final DateTime? createdAt;

  String get reference {
    final base = '$shortName $chapter:$verseStart';
    return verseEnd > verseStart ? '$base–$verseEnd' : base;
  }

  bool covers(int verse) => verse >= verseStart && verse <= verseEnd;

  factory BibleBookmark.fromJson(Map<String, dynamic> json) {
    final start = asInt(json['verse_start']);
    final end = asInt(json['verse_end']);
    final slug = str(json['book_slug']);
    final def = bookBySlug(slug);
    return BibleBookmark(
      id: asInt(json['id']),
      translation: str(json['translation_code']).isEmpty ? 'synodal' : str(json['translation_code']),
      bookSlug: slug,
      bookName: str(json['book_name']).isEmpty ? (def?.name ?? slug) : str(json['book_name']),
      shortName: str(json['short_name']).isEmpty ? (def?.shortName ?? slug) : str(json['short_name']),
      chapter: asInt(json['chapter']),
      verseStart: start < 1 ? 1 : start,
      verseEnd: end < start ? (start < 1 ? 1 : start) : end,
      createdAt: DateTime.tryParse(str(json['created_at'])),
    );
  }
}

/// Когда в озвучке главы читается стих: секунды от начала записи.
class VerseTiming {
  const VerseTiming({required this.verse, required this.start, required this.end});

  final int verse;
  final double start;
  final double end;
}

/// Озвучка главы: адрес записи и разметка по стихам (для подсветки читаемого стиха).
class BibleAudio {
  const BibleAudio({required this.url, required this.timings, this.durationSec = 0});

  final String url;
  final List<VerseTiming> timings;
  final double durationSec;

  /// Сервер иногда хранит вместо записи только разметку (`.json`) — слушать такое нельзя.
  bool get playable => url.trim().isNotEmpty && !url.trim().toLowerCase().split('?').first.endsWith('.json');

  factory BibleAudio.fromJson(Map<String, dynamic> json) {
    double num_(Object? v) => v is num ? v.toDouble() : (double.tryParse(str(v)) ?? 0);
    return BibleAudio(
      url: str(json['audio_url']),
      durationSec: num_(json['duration_sec']),
      timings: [
        for (final raw in asList(json['timings']))
          if (asInt(asMap(raw)['v']) > 0)
            VerseTiming(verse: asInt(asMap(raw)['v']), start: num_(asMap(raw)['start']), end: num_(asMap(raw)['end'])),
      ],
    );
  }
}

/// Комментарий к главе: Лопухин или церковный.
class BibleCommentary {
  const BibleCommentary({required this.id, required this.fromChurch, required this.title, required this.body, this.verseStart});

  final int id;
  final bool fromChurch;
  final String title;
  final String body;
  final int? verseStart;

  String get sourceLabel => fromChurch ? 'Церковь' : 'Лопухин';

  factory BibleCommentary.fromJson(Map<String, dynamic> json) => BibleCommentary(
        id: asInt(json['id']),
        fromChurch: str(json['source']) == 'church',
        title: str(json['title']),
        body: str(json['body']),
        verseStart: json['verse_start'] == null ? null : asInt(json['verse_start']),
      );
}
