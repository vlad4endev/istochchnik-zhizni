import '../../../core/json.dart';
import '../data/book_catalog.dart';
import '../logic/bible_ref.dart';

/// Место Писания в плане чтения: глава или несколько стихов.
class PlanRef {
  const PlanRef({required this.bookSlug, required this.chapter, this.verseStart, this.verseEnd});

  final String bookSlug;
  final int chapter;
  final int? verseStart;
  final int? verseEnd;

  BookDef? get book => bookBySlug(bookSlug);

  String get label {
    final name = book?.shortName ?? bookSlug;
    final base = '$name $chapter';
    if (verseStart == null) return base;
    final end = verseEnd;
    return end != null && end > verseStart! ? '$base:$verseStart–$end' : '$base:$verseStart';
  }

  factory PlanRef.fromJson(Map<String, dynamic> json) => PlanRef(
        bookSlug: str(json['book_slug']),
        chapter: asInt(json['chapter']) < 1 ? 1 : asInt(json['chapter']),
        verseStart: json['verse_start'] == null ? null : asInt(json['verse_start']),
        verseEnd: json['verse_end'] == null ? null : asInt(json['verse_end']),
      );
}

class BiblePlanDay {
  const BiblePlanDay({required this.id, required this.dayIndex, required this.label, required this.refs, this.date, this.completedAt});

  final int id;
  final int dayIndex;
  final String label;
  final List<PlanRef> refs;
  final DateTime? date;
  final DateTime? completedAt;

  bool get done => completedAt != null;

  String get title => label.trim().isEmpty ? 'День $dayIndex' : label.trim();

  BiblePlanDay copyWith({bool? done}) => BiblePlanDay(
        id: id,
        dayIndex: dayIndex,
        label: label,
        refs: refs,
        date: date,
        completedAt: done == null ? completedAt : (done ? (completedAt ?? DateTime.now()) : null),
      );

  factory BiblePlanDay.fromJson(Map<String, dynamic> json) => BiblePlanDay(
        id: asInt(json['id']),
        dayIndex: asInt(json['day_index']),
        label: str(json['label']),
        date: DateTime.tryParse(str(json['day_date'])),
        completedAt: DateTime.tryParse(str(json['completed_at'])),
        refs: [
          for (final raw in asList(json['refs_json']))
            if (PlanRef.fromJson(asMap(raw)).bookSlug.isNotEmpty) PlanRef.fromJson(asMap(raw)),
        ],
      );
}

class BiblePlan {
  const BiblePlan({required this.id, required this.title, required this.goal, required this.daysTotal, required this.daysCompleted, this.days = const [], this.startDate});

  final int id;
  final String title;
  final String goal;
  final int daysTotal;
  final int daysCompleted;
  final List<BiblePlanDay> days;
  final DateTime? startDate;

  double get progress => daysTotal <= 0 ? 0 : (daysCompleted / daysTotal).clamp(0.0, 1.0);

  bool get finished => daysTotal > 0 && daysCompleted >= daysTotal;

  /// Первый непрочитанный день — «что читать сегодня».
  BiblePlanDay? get nextDay {
    for (final d in days) {
      if (!d.done) return d;
    }
    return null;
  }

  BiblePlan withDays(List<BiblePlanDay> next) => BiblePlan(
        id: id,
        title: title,
        goal: goal,
        startDate: startDate,
        days: next,
        daysTotal: next.length,
        daysCompleted: next.where((d) => d.done).length,
      );

  factory BiblePlan.fromJson(Map<String, dynamic> json) {
    final days = [for (final raw in asList(json['days'])) BiblePlanDay.fromJson(asMap(raw))];
    final total = days.isNotEmpty ? days.length : asInt(json['days_total']);
    final done = days.isNotEmpty ? days.where((d) => d.done).length : asInt(json['days_completed']);
    return BiblePlan(
      id: asInt(json['id']),
      title: str(json['title']).isEmpty ? 'План чтения' : str(json['title']),
      goal: str(json['goal']),
      startDate: DateTime.tryParse(str(json['start_date'])),
      daysTotal: total,
      daysCompleted: done,
      days: days,
    );
  }
}
