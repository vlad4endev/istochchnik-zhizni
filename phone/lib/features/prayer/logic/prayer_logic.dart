import '../models/prayer_models.dart';

/// Ключ дня для API: «YYYY-MM-DD» по локальной дате.
String ymdKey(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

enum CollectionFilter {
  all('Все дни'),
  needEmpty('Без текста нужды'),
  needFilled('С текстом нужды'),
  curatorFree('Без куратора'),
  curatorMine('Мои дни'),
  curatorBusy('Заняты другими');

  const CollectionFilter(this.label);
  final String label;

  /// Фильтры по куратору работают только если отметки сбора загрузились.
  bool get needsClaims => index >= CollectionFilter.curatorFree.index;
}

class CollectionStats {
  const CollectionStats({
    required this.days,
    required this.filled,
    required this.empty,
    required this.free,
    required this.mine,
    required this.busy,
  });

  final int days;
  final int filled;
  final int empty;
  final int free;
  final int mine;
  final int busy;

  double get progress => (filled + empty) == 0 ? 0 : filled / (filled + empty);
}

bool _isMine(Claim? claim, int meId) => claim?.claimedBy?.id == meId;

CollectionStats statsFor(List<WeekDay> days, Claims claims, int meId) {
  var filled = 0, empty = 0, free = 0, mine = 0, busy = 0;
  for (final day in days) {
    final member = day.member;
    if (member == null) continue;
    member.hasNeed ? filled++ : empty++;
    final claim = claims.of(member.id);
    if (claim == null) continue;
    if (claim.claimedBy == null) {
      free++;
    } else if (_isMine(claim, meId)) {
      mine++;
    } else {
      busy++;
    }
  }
  return CollectionStats(days: days.length, filled: filled, empty: empty, free: free, mine: mine, busy: busy);
}

/// Дни недели под выбранный фильтр и поиск по имени.
List<WeekDay> filterDays(
  List<WeekDay> days,
  Claims claims,
  int meId, {
  CollectionFilter filter = CollectionFilter.all,
  String query = '',
  bool claimsOk = true,
}) {
  final needle = query.trim().toLowerCase();
  final effective = !claimsOk && filter.needsClaims ? CollectionFilter.all : filter;
  return [
    for (final day in days)
      if (_matches(day, claims, meId, effective, needle)) day,
  ];
}

bool _matches(WeekDay day, Claims claims, int meId, CollectionFilter filter, String needle) {
  final member = day.member;
  if (needle.isNotEmpty) {
    if (member == null) return false;
    final blob = '${member.displayName} ${member.person.name}'.toLowerCase();
    if (!blob.contains(needle)) return false;
  }
  switch (filter) {
    case CollectionFilter.all:
      return true;
    case CollectionFilter.needEmpty:
      return member != null && !member.hasNeed;
    case CollectionFilter.needFilled:
      return member != null && member.hasNeed;
    case CollectionFilter.curatorFree:
      final claim = member == null ? null : claims.of(member.id);
      return claim != null && claim.claimedBy == null;
    case CollectionFilter.curatorMine:
      return member != null && _isMine(claims.of(member.id), meId);
    case CollectionFilter.curatorBusy:
      final claim = member == null ? null : claims.of(member.id);
      return claim?.claimedBy != null && !_isMine(claim, meId);
  }
}

/// «Ваши участники» для куратора на выбранной неделе.
List<WeekDay> assignedTo(List<WeekDay> days, Claims claims, int meId) => [
      for (final day in days)
        if (day.member != null && _isMine(claims.of(day.member!.id), meId)) day,
    ];

/// Для админа и пастора: дни, начиная с `fromYmd`, где нужда ещё не заполнена (только участники цикла).
List<WeekDay> unfilledFrom(List<WeekDay> days, String fromYmd) => [
      for (final day in days)
        if (day.member != null && day.member!.inCycle && !day.member!.hasNeed && day.ymd.compareTo(fromYmd) >= 0) day,
    ];

/// Именинники от сегодня и ближайшие 6 дней, по возрастанию даты.
List<Birthday> upcomingBirthdays(List<Birthday> all, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  final end = today.add(const Duration(days: 6));
  final list = [
    for (final b in all)
      if (!b.date.isBefore(today) && !b.date.isAfter(end)) b,
  ];
  list.sort((a, b) {
    final byDate = a.date.compareTo(b.date);
    return byDate != 0 ? byDate : a.name.compareTo(b.name);
  });
  return list;
}
