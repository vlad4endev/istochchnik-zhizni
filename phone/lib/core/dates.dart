import 'package:intl/intl.dart';

import 'json.dart';

/// Разбор даты из API: ISO-строка, «YYYY-MM-DD» или пусто.
DateTime? parseApiDate(Object? raw) {
  final value = str(raw).trim();
  if (value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return parsed.isUtc ? parsed.toLocal() : parsed;
}

bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// «2 ч назад», «вчера», «30 сент.» — для ленты.
String relativeTime(Object? raw, {DateTime? now}) {
  final date = parseApiDate(raw);
  if (date == null) return '';
  final current = now ?? DateTime.now();
  final diff = current.difference(date);
  if (diff.inMinutes < 1) return 'только что';
  if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
  if (sameDay(date, current)) return '${diff.inHours} ч назад';
  if (sameDay(date, current.subtract(const Duration(days: 1)))) return 'вчера';
  if (date.year == current.year) return DateFormat('d MMM', 'ru').format(date);
  return DateFormat('d MMM y', 'ru').format(date);
}

/// Метка в списке чатов: время сегодня, день недели на этой неделе, иначе дата.
String chatStamp(Object? raw, {DateTime? now}) {
  final date = parseApiDate(raw);
  if (date == null) return '';
  final current = now ?? DateTime.now();
  if (sameDay(date, current)) return DateFormat('HH:mm').format(date);
  if (current.difference(date).inDays < 6) return DateFormat('EE', 'ru').format(date);
  return DateFormat('d MMM', 'ru').format(date);
}

/// «18 октября 2026».
String longDate(DateTime date) => DateFormat('d MMMM y', 'ru').format(date);

/// «18 октября».
String dayMonth(DateTime date) => DateFormat('d MMMM', 'ru').format(date);

/// «воскресенье».
String weekdayName(DateTime date) => DateFormat('EEEE', 'ru').format(date);

/// «11:00» из «11:00:00».
String shortTime(Object? raw) {
  final value = str(raw).trim();
  if (value.length >= 5 && value[2] == ':') return value.substring(0, 5);
  return value;
}

/// «1:42:10» или «58:20» из секунд.
String durationLabel(int seconds) {
  if (seconds <= 0) return '';
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  final s = seconds % 60;
  final mm = h > 0 ? m.toString().padLeft(2, '0') : '$m';
  final ss = s.toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}
