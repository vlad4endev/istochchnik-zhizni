import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/bible/data/book_catalog.dart';
import 'package:molitva/features/bible/logic/audio_logic.dart';
import 'package:molitva/features/bible/logic/bible_ref.dart' show bookBySlug;
import 'package:molitva/features/bible/logic/verse_groups.dart';
import 'package:molitva/features/bible/logic/verse_of_day.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:molitva/features/bible/models/plan_models.dart';

BibleBookmark bm(int id, int start, int end) => BibleBookmark(
      id: id,
      translation: 'synodal',
      bookSlug: 'john',
      bookName: 'От Иоанна',
      shortName: 'Ин',
      chapter: 3,
      verseStart: start,
      verseEnd: end,
      createdAt: null,
    );

void main() {
  group('стих дня', () {
    test('совпадает с сайтом: эталонные даты посчитаны той же JS-формулой', () {
      void expectPick(DateTime d, String book, int chapter, int verse) {
        final p = pickVerseOfDay(d);
        expect((p.book, p.chapter, p.verse), (book, chapter, verse), reason: '$d');
      }

      expectPick(DateTime(2026, 1, 1), 'deuteronomy', 6, 5);
      expectPick(DateTime(2026, 3, 29), 'psalms', 62, 2);
      expectPick(DateTime(2026, 11, 26), 'isaiah', 41, 10);
      expectPick(DateTime(2026, 12, 31), 'colossians', 3, 23);
      expectPick(DateTime(2027, 6, 15), 'psalms', 99, 5);
      expectPick(DateTime(2028, 2, 29), 'ephesians', 6, 11);
    });

    test('в течение суток стих один и тот же, а список — 75 существующих мест', () {
      expect(pickVerseOfDay(DateTime(2026, 5, 5, 0, 1)).book, pickVerseOfDay(DateTime(2026, 5, 5, 23, 59)).book);
      expect(verseOfDayList, hasLength(75));
      for (final ref in verseOfDayList) {
        final book = bookBySlug(ref.book);
        expect(book, isNotNull, reason: 'нет книги ${ref.book}');
        expect(ref.chapter, inInclusiveRange(1, book!.chapters), reason: '${ref.book} ${ref.chapter}');
        expect(ref.last, greaterThanOrEqualTo(ref.verse));
      }
    });

    test('за год подряд ни один день не падает и стихи сменяются', () {
      final seen = <String>{};
      for (var d = DateTime(2026, 1, 1); d.year == 2026; d = d.add(const Duration(days: 1))) {
        final p = pickVerseOfDay(d);
        seen.add('${p.book}${p.chapter}:${p.verse}');
      }
      expect(seen.length, greaterThan(60));
    });
  });

  group('группы стихов и закладка', () {
    test('подряд идущие стихи — один диапазон', () {
      expect(verseGroups([5, 3, 4, 9, 9, 11, 10]), [(start: 3, end: 5), (start: 9, end: 11)]);
      expect(verseGroups(const []), isEmpty);
      expect(verseGroups([7]), [(start: 7, end: 7)]);
    });

    test('«Закладка»: новые стихи — создать по диапазону; уже отмеченные точно — убрать', () {
      final add = planBookmarkToggle([3, 4, 8], [bm(1, 3, 5)]);
      expect(add.remove, isEmpty);
      expect(add.add, [(start: 3, end: 4), (start: 8, end: 8)], reason: '3–4 не совпадает точно с 3–5');

      final off = planBookmarkToggle([3, 4, 5], [bm(1, 3, 5), bm(2, 9, 9)]);
      expect(off.remove.map((b) => b.id), [1]);
      expect(off.add, isEmpty);

      final both = planBookmarkToggle([3, 9], [bm(1, 3, 3), bm(2, 9, 9)]);
      expect(both.remove.map((b) => b.id), [1, 2]);

      final partlyMarked = planBookmarkToggle([3, 9], [bm(1, 3, 3)]);
      expect(partlyMarked.remove, isEmpty, reason: 'если есть что добавить — ничего не снимаем');
      expect(partlyMarked.add, [(start: 9, end: 9)]);

      expect(planBookmarkToggle(const [], [bm(1, 1, 1)]).add, isEmpty);
    });
  });

  group('озвучка: логика', () {
    const t = [
      VerseTiming(verse: 1, start: 0, end: 4),
      VerseTiming(verse: 2, start: 4.35, end: 9),
      VerseTiming(verse: 3, start: 9.35, end: 12),
    ];

    test('читаемый стих по времени, в паузах — последний начавшийся', () {
      expect(verseFromTimings(t, 0), 1);
      expect(verseFromTimings(t, 3.9), 1);
      expect(verseFromTimings(t, 4.1), 1, reason: 'пауза между стихами: ещё первый');
      expect(verseFromTimings(t, 4.35), 2);
      expect(verseFromTimings(t, 11.9), 3);
      expect(verseFromTimings(t, 60), 3, reason: 'после последнего стиха остаётся последний');
      expect(verseFromTimings(t, -1), isNull);
      expect(verseFromTimings(t, double.nan), isNull);
      expect(verseFromTimings(const [], 3), isNull);
    });

    test('начало стиха для «слушать с этого стиха»', () {
      expect(startOfVerse(t, 2), 4.35);
      expect(startOfVerse(t, 99), isNull);
    });

    test('время «м:сс»', () {
      expect(formatAudioTime(Duration.zero), '0:00');
      expect(formatAudioTime(const Duration(seconds: 65)), '1:05');
      expect(formatAudioTime(const Duration(minutes: 12, seconds: 3)), '12:03');
      expect(formatAudioTime(const Duration(seconds: -5)), '0:00');
    });

    test('следующая глава: в книге, через границу книг, после последней — нет', () {
      final books = [for (final d in bibleBooks) BibleBook.fromDef(d)];
      expect(nextChapterAfter(books, 'john', 3), (slug: 'john', name: 'От Иоанна', chapter: 4));
      final lastJohn = books.firstWhere((b) => b.slug == 'john').chapters;
      expect(nextChapterAfter(books, 'john', lastJohn)?.slug, 'acts');
      expect(nextChapterAfter(books, 'john', lastJohn)?.chapter, 1);
      final last = books.last;
      expect(nextChapterAfter(books, last.slug, last.chapters), isNull);
      expect(nextChapterAfter(books, 'нет-такой', 1), isNull);
    });
  });

  group('модели', () {
    test('закладка читается из ответа сервера, ссылка с диапазоном', () {
      final b = BibleBookmark.fromJson({
        'id': 7,
        'translation_code': 'synodal',
        'book_slug': 'john',
        'book_name': 'От Иоанна',
        'short_name': 'Ин',
        'chapter': 3,
        'verse_start': 16,
        'verse_end': 18,
        'created_at': '2026-11-20T10:00:00Z',
      });
      expect(b.reference, 'Ин 3:16–18');
      expect(b.covers(17), isTrue);
      expect(b.covers(19), isFalse);
      expect(bm(1, 5, 5).reference, 'Ин 3:5');
      final broken = BibleBookmark.fromJson({'id': 1, 'book_slug': 'john', 'chapter': 1, 'verse_start': 0, 'verse_end': 0});
      expect(broken.verseStart, 1);
      expect(broken.shortName, 'Ин', reason: 'название берётся из каталога, если сервер не прислал');
    });

    test('озвучка: адрес и разметка; запись-заглушка .json не воспроизводится', () {
      final a = BibleAudio.fromJson({
        'audio_url': 'https://cdn/x/john3.mp3?v=1',
        'duration_sec': 301.5,
        'timings': [
          {'v': 1, 'start': 0, 'end': 4.2},
          {'v': 0, 'start': 1, 'end': 2},
          {'v': 2, 'start': '4.5', 'end': 9},
        ],
      });
      expect(a.playable, isTrue);
      expect(a.timings.map((t) => t.verse), [1, 2], reason: 'стих №0 отбрасывается');
      expect(a.timings.last.start, 4.5);
      expect(a.durationSec, 301.5);
      expect(BibleAudio.fromJson({'audio_url': 'https://cdn/john3.json?x=1'}).playable, isFalse);
      expect(BibleAudio.fromJson({'audio_url': ''}).playable, isFalse);
    });

    test('комментарий: источник и подпись', () {
      final c = BibleCommentary.fromJson({'id': 1, 'source': 'church', 'title': 'Заметка', 'body': 'Текст', 'verse_start': 5});
      expect(c.sourceLabel, 'Церковь');
      expect(c.verseStart, 5);
      expect(BibleCommentary.fromJson({'id': 2, 'source': 'lopukhin', 'body': 'x'}).sourceLabel, 'Лопухин');
    });

    test('план: прогресс, следующий день, отметка дня', () {
      final plan = BiblePlan.fromJson({
        'id': 3,
        'title': 'Евангелия',
        'goal': 'Евангелия за 3 дня',
        'days': [
          {'id': 1, 'day_index': 1, 'label': 'Мф 1–2', 'completed_at': '2026-11-01T08:00:00Z', 'refs_json': [{'book_slug': 'matthew', 'chapter': 1}, {'book_slug': 'matthew', 'chapter': 2}]},
          {'id': 2, 'day_index': 2, 'label': '', 'refs_json': [{'book_slug': 'john', 'chapter': 3, 'verse_start': 16, 'verse_end': 18}]},
          {'id': 3, 'day_index': 3, 'label': 'Ин 4', 'refs_json': []},
        ],
      });
      expect(plan.daysTotal, 3);
      expect(plan.daysCompleted, 1);
      expect(plan.progress, closeTo(1 / 3, 1e-9));
      expect(plan.nextDay?.dayIndex, 2);
      expect(plan.nextDay?.title, 'День 2');
      expect(plan.days.first.refs.map((r) => r.label), ['Мф 1', 'Мф 2']);
      expect(plan.days[1].refs.single.label, 'Ин 3:16–18');
      final marked = plan.withDays([for (final d in plan.days) d.dayIndex == 2 ? d.copyWith(done: true) : d]);
      expect(marked.daysCompleted, 2);
      expect(marked.nextDay?.dayIndex, 3);
      expect(marked.finished, isFalse);
      final unmarked = marked.withDays([for (final d in marked.days) d.copyWith(done: false)]);
      expect(unmarked.daysCompleted, 0);
      expect(BiblePlan.fromJson({'id': 1, 'days_total': 30, 'days_completed': 30}).finished, isTrue);
      expect(BiblePlan.fromJson({'id': 1}).progress, 0);
    });
  });
}
