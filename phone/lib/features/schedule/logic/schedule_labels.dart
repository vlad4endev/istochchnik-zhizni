import '../../../core/dates.dart';
import '../models/schedule_models.dart';
import '../schedule_controller.dart';

/// «Сегодня», «Завтра» или «В воскресенье, 22 ноября» — как говорят люди.
String friendlyDay(DateTime date, DateTime today) {
  final d = dateOnly(date);
  final diff = d.difference(dateOnly(today)).inDays;
  if (diff == 0) return 'Сегодня';
  if (diff == 1) return 'Завтра';
  final (preposition, day) = switch (weekdayName(d)) {
    'вторник' => ('Во', 'вторник'),
    'среда' => ('В', 'среду'),
    'пятница' => ('В', 'пятницу'),
    'суббота' => ('В', 'субботу'),
    final other => ('В', other),
  };
  return '$preposition $day, ${dayMonth(d)}';
}

/// Подпись недели в списке: «Эта неделя», «Следующая неделя», «30 ноября – 6 декабря».
String weekLabel(DateTime monday, DateTime today) {
  final thisMonday = mondayOf(today);
  final weeks = monday.difference(thisMonday).inDays ~/ 7;
  if (weeks == 0) return 'Эта неделя';
  if (weeks == 1) return 'Следующая неделя';
  return weekRange(monday);
}

/// «16–22 ноября» или «30 ноября – 6 декабря».
String weekRange(DateTime monday) {
  final end = monday.add(const Duration(days: 6));
  if (monday.month == end.month) return '${monday.day}–${dayMonth(end)}';
  return '${dayMonth(monday)} – ${dayMonth(end)}';
}

/// Элементы ленты, сгруппированные по неделям в порядке следования.
List<({DateTime monday, List<AgendaItem> items})> groupByWeek(List<AgendaItem> items) {
  final groups = <DateTime, List<AgendaItem>>{};
  for (final item in items) {
    groups.putIfAbsent(mondayOf(item.date), () => []).add(item);
  }
  return [for (final e in groups.entries) (monday: e.key, items: e.value)];
}

/// «Ждут ответа: 1 назначение» — с правильным склонением.
String awaitingText(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  final word = mod10 == 1 && mod100 != 11 ? 'назначение' : (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'назначения' : 'назначений');
  return '$n $word';
}
