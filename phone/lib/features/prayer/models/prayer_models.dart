import '../../../core/dates.dart';
import '../../../core/json.dart';

/// «Фамилия Имя» для списков — как `memberRosterName` на сайте.
///
/// Колонки имени и фамилии главнее поля `name`; если есть только `name`:
/// из трёх слов первое — фамилия, из двух — «Имя Фамилия».
String rosterName({required String name, String first = '', String last = '', int? id}) {
  var f = first.trim();
  var l = last.trim();
  if (f.isEmpty || l.isEmpty) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    var nameFirst = '';
    var nameLast = '';
    if (parts.length >= 3) {
      nameLast = parts.first;
      nameFirst = parts.skip(1).join(' ');
    } else if (parts.length == 2) {
      nameFirst = parts[0];
      nameLast = parts[1];
    } else if (parts.length == 1) {
      nameFirst = parts[0];
    }
    if (f.isEmpty && l.isEmpty) {
      f = nameFirst;
      l = nameLast;
    } else {
      if (f.isEmpty) f = nameFirst;
      if (l.isEmpty) l = nameLast;
    }
  }
  final joined = '$l $f'.trim();
  if (joined.isNotEmpty) return joined;
  if (name.trim().isNotEmpty) return name.trim();
  return id == null ? '' : '#$id';
}

/// Человек из ответов календаря: участник дня, куратор, зритель раздела.
class Person {
  const Person({required this.id, required this.name, this.firstName = '', this.lastName = ''});

  final int id;
  final String name;
  final String firstName;
  final String lastName;

  String get displayName => rosterName(name: name, first: firstName, last: lastName, id: id);

  static Person? tryParse(Object? raw) {
    final m = asMap(raw);
    if (m.isEmpty) return null;
    final id = asInt(m['id'] ?? m['member_id']);
    if (id <= 0) return null;
    return Person(id: id, name: str(m['name']), firstName: str(m['first_name']), lastName: str(m['last_name']));
  }
}

enum NoteKind {
  urgentPrayer('urgent_prayer', 'Срочная молитвенная нужда'),
  announcement('announcement', 'Объявление');

  const NoteKind(this.api, this.title);
  final String api;
  final String title;
}

enum NoteDuration {
  day('day', 'Только сегодня'),
  week('week', 'До конца этой недели'),
  month('month', 'До конца месяца');

  const NoteDuration(this.api, this.label);
  final String api;
  final String label;
}

/// Срочная нужда или объявление координатора.
class CoordinatorNote {
  const CoordinatorNote({required this.text, this.start, this.end});

  final String text;
  final DateTime? start;
  final DateTime? end;

  static CoordinatorNote? tryParse(Object? raw) {
    final m = asMap(raw);
    final text = str(m['text']).trim();
    if (text.isEmpty) return null;
    return CoordinatorNote(text: text, start: _ymd(m['start_date']), end: _ymd(m['end_date']));
  }

  /// Подбирает пресет срока по сохранённым датам — как при сохранении на сервере.
  NoteDuration get duration {
    final s = start;
    final e = end;
    if (s == null || e == null || sameDay(s, e)) return NoteDuration.day;
    final daysFromMonday = (s.weekday + 6) % 7;
    final sunday = DateTime(s.year, s.month, s.day - daysFromMonday + 6);
    if (sameDay(sunday, e)) return NoteDuration.week;
    if (sameDay(DateTime(s.year, s.month + 1, 0), e)) return NoteDuration.month;
    return NoteDuration.day;
  }
}

/// Строго «YYYY-MM-DD»: мусор вроде «Sat Nov 21 2026…» дат не даёт.
DateTime? _ymd(Object? raw) {
  final value = str(raw).trim();
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
  if (m == null) return null;
  return DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
}

class CoordinatorNotes {
  const CoordinatorNotes({this.urgent, this.announcement});

  static const empty = CoordinatorNotes();

  final CoordinatorNote? urgent;
  final CoordinatorNote? announcement;

  CoordinatorNote? of(NoteKind kind) => kind == NoteKind.urgentPrayer ? urgent : announcement;

  factory CoordinatorNotes.fromJson(Object? raw) {
    final m = asMap(raw);
    return CoordinatorNotes(
      urgent: CoordinatorNote.tryParse(m['urgent_prayer']),
      announcement: CoordinatorNote.tryParse(m['announcement']),
    );
  }
}

class Backslider {
  const Backslider({required this.id, required this.name});
  final int id;
  final String name;

  static List<Backslider> parseList(Object? raw) => [
        for (final item in asList(raw))
          if (str(asMap(item)['name']).trim().isNotEmpty)
            Backslider(id: asInt(asMap(item)['id']), name: str(asMap(item)['name']).trim()),
      ];
}

/// Запись о прошлой нуждe (справка для координатора).
class PreviousNeed {
  const PreviousNeed({required this.id, required this.note, required this.createdAt});
  final int id;
  final String note;
  final DateTime? createdAt;

  static List<PreviousNeed> parseList(Object? raw) => [
        for (final item in asList(raw))
          if (str(asMap(item)['note']).trim().isNotEmpty)
            PreviousNeed(
              id: asInt(asMap(item)['id']),
              note: str(asMap(item)['note']),
              createdAt: parseApiDate(asMap(item)['created_at']),
            ),
      ];
}

/// Участник цикла в плане недели.
class WeekMember {
  const WeekMember({
    required this.person,
    required this.prayerRequest,
    this.inCycle = true,
    this.previousNeeds = const [],
  });

  final Person person;
  final String prayerRequest;
  final bool inCycle;
  final List<PreviousNeed> previousNeeds;

  int get id => person.id;
  String get displayName => person.displayName;
  bool get hasNeed => prayerRequest.trim().isNotEmpty;

  WeekMember withNeed(String text) =>
      WeekMember(person: person, prayerRequest: text.trim(), inCycle: inCycle, previousNeeds: previousNeeds);

  static WeekMember? tryParse(Object? raw) {
    final person = Person.tryParse(raw);
    if (person == null) return null;
    final m = asMap(raw);
    final cycle = m['in_prayer_cycle'];
    return WeekMember(
      person: person,
      prayerRequest: str(m['prayer_request']).trim(),
      inCycle: !(cycle == false || cycle == 0 || cycle == '0' || cycle == 'false'),
      previousNeeds: PreviousNeed.parseList(m['previous_manual_prayer_needs']),
    );
  }
}

/// День недели плана: за кого молимся (может быть пусто).
class WeekDay {
  const WeekDay({required this.date, required this.ymd, this.member});

  final DateTime date;

  /// Ключ дня для API.
  final String ymd;
  final WeekMember? member;

  WeekDay withMember(WeekMember? next) => WeekDay(date: date, ymd: ymd, member: next);

  static List<WeekDay> parseList(Object? raw) {
    final days = <WeekDay>[];
    for (final item in asList(asMap(raw)['days'])) {
      final m = asMap(item);
      final ymd = str(m['date']);
      final date = _ymd(ymd);
      if (date == null) continue;
      days.add(WeekDay(date: date, ymd: ymd.substring(0, 10), member: WeekMember.tryParse(m['member'])));
    }
    return days;
  }
}

/// Кто отвечает за сбор нужды участника.
class Claim {
  const Claim({required this.memberId, this.claimedBy, this.canToggle = false});
  final int memberId;
  final Person? claimedBy;
  final bool canToggle;
}

class Claims {
  const Claims({this.coordinators = const [], this.byMember = const {}});

  static const empty = Claims();

  final List<Person> coordinators;
  final Map<int, Claim> byMember;

  Claim? of(int memberId) => byMember[memberId];

  factory Claims.fromJson(Object? raw) {
    final m = asMap(raw);
    final byMember = <int, Claim>{};
    for (final item in asList(m['members'])) {
      final row = asMap(item);
      final id = asInt(row['id']);
      if (id <= 0) continue;
      byMember[id] = Claim(
        memberId: id,
        claimedBy: Person.tryParse(row['claimed_by']),
        canToggle: asBool(row['can_toggle']),
      );
    }
    return Claims(
      coordinators: [for (final c in asList(m['coordinators'])) ?Person.tryParse(c)],
      byMember: byMember,
    );
  }
}

/// Итог автораспределения кураторов.
class DistributionResult {
  const DistributionResult({required this.total, required this.notified});
  final int total;
  final int notified;

  factory DistributionResult.fromJson(Object? raw) {
    final m = asMap(raw);
    return DistributionResult(total: asInt(m['total']), notified: asInt(m['pushed_coordinators']));
  }
}

class PrayerViewer {
  const PrayerViewer({required this.person, this.firstSeen});
  final Person person;
  final DateTime? firstSeen;
}

/// Кто сегодня открывал раздел «Молитва» (для пастора и администратора).
class ViewersToday {
  const ViewersToday({this.count = 0, this.viewers = const []});
  final int count;
  final List<PrayerViewer> viewers;

  factory ViewersToday.fromJson(Object? raw) {
    final m = asMap(raw);
    final viewers = [
      for (final item in asList(m['viewers']))
        if (Person.tryParse(item) case final person?)
          PrayerViewer(person: person, firstSeen: parseApiDate(asMap(item)['first_seen_at'])),
    ];
    final count = asInt(m['unique_viewers_today']);
    return ViewersToday(count: count > 0 ? count : viewers.length, viewers: viewers);
  }
}

/// Именинник текущей недели.
class Birthday {
  const Birthday({required this.id, required this.name, required this.date});
  final int id;
  final String name;
  final DateTime date;

  static List<Birthday> parseList(Object? raw) {
    final items = <Birthday>[];
    for (final item in asList(asMap(raw)['items'])) {
      final m = asMap(item);
      final date = _ymd(m['week_date']);
      final name = str(m['name']).trim();
      if (date == null || name.isEmpty) continue;
      items.add(Birthday(id: asInt(m['id']), name: name, date: date));
    }
    return items;
  }
}
