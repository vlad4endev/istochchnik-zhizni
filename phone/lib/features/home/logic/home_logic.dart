import 'package:intl/intl.dart';

import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../../schedule/models/schedule_models.dart';
import '../../service/models/plan_models.dart';
import '../models/home_models.dart';

/// Длительность слота эфира от времени начала — ровно два часа, как на сайте.
const broadcastSlot = Duration(hours: 2);

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

// ───────────────────────── ближайшее служение ─────────────────────────

/// Старт служения: дата + «HH:mm»; без времени — null.
DateTime? planStart(PlanSummary plan) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(plan.startTime.trim());
  if (m == null) return null;
  return DateTime(plan.date.year, plan.date.month, plan.date.day, int.parse(m.group(1)!), int.parse(m.group(2)!));
}

/// Фаза служения: до начала, идёт, окно отзывов (5 часов после конца) или закрыто.
ServicePhase planPhase(PlanSummary plan, DateTime now) {
  final start = planStart(plan);
  if (start == null) return ServicePhase.closed;
  final end = start.add(Duration(minutes: plan.totalMinutes < 0 ? 0 : plan.totalMinutes));
  final feedbackEnd = end.add(const Duration(hours: 5));
  if (now.isBefore(start)) return ServicePhase.upcoming;
  if (!now.isAfter(end)) return ServicePhase.live;
  if (!now.isAfter(feedbackEnd)) return ServicePhase.feedback;
  return ServicePhase.closed;
}

/// Ближайшее служение: сперва идущее или в окне отзывов (самое позднее по старту),
/// иначе ближайшее будущее.
PlanSummary? pickNearestPlan(List<PlanSummary> plans, DateTime now) {
  final rows = [
    for (final p in plans)
      if (planStart(p) != null && planPhase(p, now) != ServicePhase.closed) (plan: p, start: planStart(p)!, phase: planPhase(p, now)),
  ];
  final started = [for (final r in rows) if (r.phase == ServicePhase.live || r.phase == ServicePhase.feedback) r]
    ..sort((a, b) => b.start.compareTo(a.start));
  if (started.isNotEmpty) return started.first.plan;
  final upcoming = [for (final r in rows) if (r.phase == ServicePhase.upcoming) r]..sort((a, b) => a.start.compareTo(b.start));
  return upcoming.isEmpty ? null : upcoming.first.plan;
}

/// Тема и стих проповеди: первый блок, где заполнено и то и другое.
({String topic, String scripture})? sermonOf(List<PlanBlock> blocks) {
  for (final b in blocks) {
    final topic = str(b.content['sermon_topic']).trim();
    final scripture = str(b.content['sermon_scripture']).trim();
    if (topic.isNotEmpty && scripture.isNotEmpty) return (topic: topic, scripture: scripture);
  }
  return null;
}

/// «Вск, 22 ноября 2026» — подпись даты в шапке карточки.
String serviceDateLabel(DateTime date) {
  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вск'];
  return '${weekdays[date.weekday - 1]}, ${DateFormat('d MMMM yyyy', 'ru').format(date)}';
}

/// «Тема» в кавычках-ёлочках, если пользователь не поставил свои.
String sermonTitle(String topic) {
  final t = topic.trim();
  return RegExp('^[«"].*[»"]\$').hasMatch(t) ? t : '«$t»';
}

/// «Михаил Самодуров - Вера и язык» — строка-резюме под стихом.
String sermonSummary(String preacher, String topic) =>
    '$preacher - ${topic.trim().replaceAll(RegExp('^[«"]|[»"]\$'), '')}';

// ───────────────────────── мероприятия ─────────────────────────

String _hhmm(DateTime d) => DateFormat('HH:mm').format(d);

DateTime? _eventMoment(Map<String, dynamic> e, DateTime now) {
  final time = shortTime(e['event_time']);
  final h = int.tryParse(time.split(':').first) ?? 0;
  final min = time.contains(':') ? int.tryParse(time.split(':')[1]) ?? 0 : 0;
  if (str(e['recurrence_type']) == 'weekly') {
    final weekly = e['weekly_day'] is num ? (e['weekly_day'] as num).toInt() : 0; // 0 = воскресенье
    final diff = (weekly - (now.weekday % 7) + 7) % 7;
    var base = DateTime(now.year, now.month, now.day + diff, h, min);
    if (base.isBefore(now)) base = base.add(const Duration(days: 7));
    return base;
  }
  final date = parseApiDate(e['event_date']);
  if (date == null) return null;
  return DateTime(date.year, date.month, date.day, h, min);
}

String _whenLabel(DateTime date, DateTime now) {
  final today = _day(now);
  final diff = _day(date).difference(today).inDays;
  final time = _hhmm(date);
  if (diff == 0) return 'Сегодня в $time';
  if (diff == 1) return 'Завтра в $time';
  return '${weekdayName(date)} в $time';
}

/// Ближайшее мероприятие: сегодня, потом завтра, потом в ближайшие 7 дней, потом любое будущее.
HomeEvent pickUpcomingEvent(DateTime now, List<dynamic> events) {
  final rows = <({Map<String, dynamic> item, DateTime at})>[];
  for (final raw in events) {
    final item = asMap(raw);
    if (item.containsKey('is_active') && !asBool(item['is_active'])) continue;
    final at = _eventMoment(item, now);
    if (at != null) rows.add((item: item, at: at));
  }
  rows.sort((a, b) => a.at.compareTo(b.at));
  HomeEvent make(({Map<String, dynamic> item, DateTime at}) r) {
    final title = str(r.item['title']).trim();
    final description = str(r.item['description']).trim();
    final poster = str(r.item['poster_url']).trim();
    return HomeEvent(
      title: title.isEmpty ? 'Событие' : title,
      description: description.isEmpty ? 'Подробное описание скоро появится.' : description,
      whenLabel: _whenLabel(r.at, now),
      posterUrl: poster.isEmpty ? null : poster,
    );
  }

  if (rows.isEmpty) {
    return const HomeEvent(
      title: 'Мероприятий пока нет',
      description: 'Администратор скоро добавит новые мероприятия.',
      whenLabel: 'Следите за обновлениями',
      isPlaceholder: true,
    );
  }
  final today = _day(now);
  final todayRow = rows.where((r) => sameDay(r.at, now) && !r.at.isBefore(now)).firstOrNull ?? rows.where((r) => sameDay(r.at, now)).firstOrNull;
  if (todayRow != null) return make(todayRow);
  final tomorrow = rows.where((r) => sameDay(r.at, today.add(const Duration(days: 1)))).firstOrNull;
  if (tomorrow != null) return make(tomorrow);
  final weekEnd = now.add(const Duration(days: 7));
  final week = rows.where((r) => r.at.isAfter(now) && !r.at.isAfter(weekEnd)).firstOrNull;
  if (week != null) return make(week);
  return make(rows.where((r) => r.at.isAfter(now)).firstOrNull ?? rows.first);
}

// ───────────────────────── трансляция ─────────────────────────

enum BroadcastMode { hidden, pre, onAir, post }

BroadcastMode broadcastMode(DateTime now, BroadcastInfo? b) {
  if (b == null || b.status == 'finished') return BroadcastMode.hidden;
  final start = b.startsAt;
  final end = start?.add(broadcastSlot);
  if (b.status == 'live') {
    if (start == null) return BroadcastMode.onAir;
    return !now.isBefore(end!) ? BroadcastMode.post : BroadcastMode.onAir;
  }
  if (start == null) return BroadcastMode.hidden;
  if (!now.isBefore(end!)) return BroadcastMode.post;
  if (!now.isBefore(start)) return b.hasStream ? BroadcastMode.onAir : BroadcastMode.pre;
  return BroadcastMode.pre;
}

/// Виджет трансляции: в эфире, либо до начала осталось не больше двух часов.
bool showBroadcast(DateTime now, BroadcastInfo? b) {
  final mode = broadcastMode(now, b);
  if (mode == BroadcastMode.onAir) return true;
  if (mode != BroadcastMode.pre) return false;
  final start = b?.startsAt;
  return start != null && !now.isBefore(start.subtract(broadcastSlot));
}

/// «00:42:10»: сколько идёт эфир или сколько осталось до начала.
String broadcastTimer(DateTime now, BroadcastInfo? b) {
  final start = b?.startsAt;
  if (b == null || start == null || b.status == 'finished') return '—';
  final mode = broadcastMode(now, b);
  if (mode == BroadcastMode.post || mode == BroadcastMode.hidden) return '—';
  final diff = mode == BroadcastMode.onAir ? now.difference(start) : start.difference(now);
  final d = diff.isNegative ? Duration.zero : diff;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
}

String broadcastPlatform(String platform) => switch (platform) {
      'youtube' => 'YouTube',
      'rutube' => 'RuTube',
      'vk' => 'VK Видео',
      _ => 'Платформа',
    };

String broadcastDateTime(DateTime? d) => d == null ? '—' : DateFormat('dd.MM.yyyy HH:mm').format(d);

// ───────────────────────── подкаст ─────────────────────────

/// Самый свежий выпуск по дате публикации.
Episode? latestEpisode(List<Episode> episodes) {
  if (episodes.isEmpty) return null;
  final sorted = [...episodes]..sort((a, b) => (b.published ?? DateTime(0)).compareTo(a.published ?? DateTime(0)));
  return sorted.first;
}

// ───────────────────────── «Молимся сегодня» ─────────────────────────

/// «Сегодня воскресенье, 22 ноября».
String todayPrayerLabel(DateTime now) => 'Сегодня ${DateFormat('EEEE, d MMMM', 'ru').format(now)}';

// ───────────────────────── «Твоё служение на этой неделе» ─────────────────────────

/// Воскресенье, к которому привязана неделя: дата служения или ближайшее воскресенье.
DateTime anchorSunday(DateTime? serviceDate, DateTime now) {
  if (serviceDate != null) return _day(serviceDate);
  final today = _day(now);
  final add = (7 - today.weekday % 7) % 7;
  return today.add(Duration(days: add));
}

/// Склеивает позиции человека в карточки: одно собрание — одна карточка.
List<MyServiceCard> buildMyService({
  required DateTime sunday,
  required int memberId,
  List<ScheduleEvent> music = const [],
  List<ScheduleEvent> media = const [],
  List<SundayPlan> sundayPlans = const [],
}) {
  final cards = <MyServiceCard>[];

  void collect(ServiceMinistry ministry, List<ScheduleEvent> events) {
    final byEvent = <int, List<MyRole>>{};
    final heads = <int, ScheduleEvent>{};
    for (final e in events) {
      if (!sameDay(e.date, sunday)) continue;
      for (final a in e.assignments) {
        // «Моё расписание» уже отфильтровано сервером; но на всякий случай — только мои.
        if (a.memberId != 0 && a.memberId != memberId) continue;
        byEvent.putIfAbsent(e.planId, () => []).add(MyRole(assignmentId: a.id, roleName: a.role.name, color: a.role.color, status: a.status));
        heads[e.planId] = e;
      }
    }
    for (final entry in byEvent.entries) {
      final head = heads[entry.key]!;
      // Дубли одной позиции (событие пришло дважды) схлопываем по id назначения.
      final seen = <int?>{};
      final roles = [for (final r in entry.value) if (seen.add(r.assignmentId)) r];
      cards.add(MyServiceCard(
        key: '${ministry.name}:${entry.key}',
        ministry: ministry,
        date: head.date,
        startTime: head.startTime,
        eventTitle: head.title,
        roles: roles,
      ));
    }
  }

  collect(ServiceMinistry.music, music);
  collect(ServiceMinistry.media, media);

  for (final plan in sundayPlans) {
    if (!sameDay(plan.date, sunday)) continue;
    final role = plan.leader?.id == memberId
        ? 'Ведущий'
        : (plan.preacher?.id == memberId ? 'Проповедник' : null);
    if (role == null) continue;
    cards.add(MyServiceCard(
      key: 'sunday:${plan.id}:$role',
      ministry: ServiceMinistry.sunday,
      date: plan.date,
      startTime: plan.startTime,
      eventTitle: plan.title,
      roles: [MyRole(roleName: role, color: parseHexColor('#6B2D3E'), status: AssignmentStatus.assigned)],
    ));
  }
  const order = {ServiceMinistry.sunday: 0, ServiceMinistry.music: 1, ServiceMinistry.media: 2};
  cards.sort((a, b) => order[a.ministry]!.compareTo(order[b.ministry]!));
  return cards;
}
