import 'dart:async';

import 'package:flutter/foundation.dart';

import 'data/schedule_repository.dart';
import 'logic/ministry_access.dart';
import 'models/schedule_models.dart';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Понедельник той недели, в которую попадает [d].
DateTime mondayOf(DateTime d) => dateOnly(d).subtract(Duration(days: d.weekday - DateTime.monday));

/// Расписание: «мои» назначения со сводным ответом и общее расписание команды недели.
class ScheduleController extends ChangeNotifier {
  ScheduleController(
    this.source, {
    required this.access,
    required this.userId,
    DateTime Function()? clock,
    this.horizonWeeks = 12,
  }) : _clock = clock ?? DateTime.now {
    ministries = access.viewable;
    teamMinistry = ministries.isEmpty ? null : ministries.first;
    weekStart = mondayOf(_clock());
  }

  final ScheduleSource source;
  final MinistryAccess access;
  final int userId;
  final int horizonWeeks;
  final DateTime Function() _clock;

  /// Служения, которые человек видит. Если сервер ответил 403 — служение убирается.
  late List<Ministry> ministries;

  // ——— мои назначения ———
  bool loadingMine = true;
  List<AgendaItem> agenda = const [];
  Set<Ministry> failedMinistries = {};
  DateTime? staleSince;
  /// Ключ — служение и id: в медиа и музыке номера назначений считаются отдельно и могут совпасть.
  final Set<String> _busy = {};

  static String _busyKey(AgendaItem item) => '${item.ministry.name}:${item.assignmentId}';
  bool _disposed = false;

  bool isBusy(AgendaItem item) => item.assignmentId != null && _busy.contains(_busyKey(item));

  DateTime get today => dateOnly(_clock());

  List<AgendaItem> get pending => [for (final i in agenda) if (i.awaitsAnswer) i];

  AgendaItem? get next => agenda.isEmpty ? null : agenda.first;

  Future<void> loadMine() async {
    loadingMine = agenda.isEmpty;
    notifyListeners();
    final from = today;
    final to = from.add(Duration(days: horizonWeeks * 7));
    final items = <AgendaItem>[];
    final failed = <Ministry>{};
    final denied = <Ministry>{};
    DateTime? stale;

    Future<void> loadOne(Ministry m) async {
      try {
        if (m == Ministry.sunday) {
          final r = await source.mySunday(from, to);
          stale = _older(stale, r.staleSince);
          items.addAll(_sundayItems(r.items));
        } else {
          final r = await source.myEvents(m, from, to);
          stale = _older(stale, r.staleSince);
          items.addAll(_eventItems(r.items));
        }
      } on NoAccessException {
        denied.add(m);
      } catch (_) {
        failed.add(m);
      }
    }

    await Future.wait([for (final m in ministries) loadOne(m)]);
    if (_disposed) return;

    if (denied.isNotEmpty) {
      ministries = [for (final m in ministries) if (!denied.contains(m)) m];
      if (teamMinistry != null && denied.contains(teamMinistry)) teamMinistry = ministries.isEmpty ? null : ministries.first;
    }
    items.sort((a, b) {
      final byDate = a.date.compareTo(b.date);
      if (byDate != 0) return byDate;
      final byTime = a.startTime.compareTo(b.startTime);
      return byTime != 0 ? byTime : a.ministry.index.compareTo(b.ministry.index);
    });
    agenda = [for (final i in items) if (!i.date.isBefore(from)) i];
    failedMinistries = failed;
    staleSince = stale;
    loadingMine = false;
    notifyListeners();
  }

  DateTime? _older(DateTime? a, DateTime? b) => a == null ? b : (b == null ? a : (a.isBefore(b) ? a : b));

  List<AgendaItem> _eventItems(List<ScheduleEvent> events) => [
        for (final e in events)
          for (final a in e.assignments)
            // «Моё» расписание сервер уже отфильтровал; на случай ответа с чужими строками — свои.
            if (a.memberId == userId || a.memberId == 0)
              AgendaItem(
                ministry: e.ministry,
                date: e.date,
                startTime: e.startTime,
                title: e.title,
                roleName: a.role.name,
                roleColor: a.role.color,
                assignmentId: a.id,
                status: a.status,
                planId: e.planId,
              ),
      ];

  List<AgendaItem> _sundayItems(List<SundayPlan> plans) {
    final out = <AgendaItem>[];
    for (final p in plans) {
      final roles = [if (p.leader?.id == userId) 'Ведущий', if (p.preacher?.id == userId) 'Проповедник'];
      if (roles.isEmpty) continue;
      out.add(AgendaItem(
        ministry: Ministry.sunday,
        date: p.date,
        startTime: p.startTime,
        title: p.title,
        roleName: roles.join(' и '),
        planId: p.id,
      ));
    }
    return out;
  }

  /// Подтвердить или отказаться. Экран отвечает сразу, при ошибке сети откат и исключение для сообщения.
  Future<void> answer(AgendaItem item, AssignmentStatus status) async {
    final id = item.assignmentId;
    final key = _busyKey(item);
    if (id == null || !_busy.add(key)) return;
    final before = agenda;
    agenda = [for (final i in agenda) i.assignmentId == id && i.ministry == item.ministry ? i.withStatus(status) : i];
    notifyListeners();
    try {
      await source.setStatus(item.ministry, id, status);
    } catch (_) {
      agenda = before;
      rethrow;
    } finally {
      _busy.remove(key);
      if (!_disposed) notifyListeners();
    }
  }

  /// «Подтвердить все»: возвращает, сколько ответов не удалось отправить.
  Future<int> confirmAllPending() async {
    var failed = 0;
    for (final item in pending) {
      try {
        await answer(item, AssignmentStatus.confirmed);
      } catch (_) {
        failed++;
      }
    }
    return failed;
  }

  // ——— команда ———
  Ministry? teamMinistry;
  late DateTime weekStart;
  bool loadingTeam = false;
  String? teamError;
  List<ScheduleEvent> teamEvents = const [];
  List<SundayPlan> teamSunday = const [];
  List<ScheduleRole> teamRoles = const [];
  int _teamToken = 0;

  DateTime get weekEnd => weekStart.add(const Duration(days: 6));

  bool get isThisWeek => weekStart == mondayOf(_clock());

  bool canManage(Ministry m) => access.canManage(m);

  Future<void> selectMinistry(Ministry m) async {
    if (teamMinistry == m) return;
    teamMinistry = m;
    await loadTeam();
  }

  Future<void> shiftWeek(int weeks) async {
    weekStart = weekStart.add(Duration(days: 7 * weeks));
    await loadTeam();
  }

  Future<void> goToThisWeek() async {
    weekStart = mondayOf(_clock());
    await loadTeam();
  }

  Future<void> loadTeam() async {
    final m = teamMinistry;
    if (m == null) return;
    final token = ++_teamToken;
    loadingTeam = true;
    teamError = null;
    notifyListeners();
    try {
      if (m == Ministry.sunday) {
        final plans = await source.sundayPlans(weekStart, weekEnd);
        if (token != _teamToken || _disposed) return;
        teamSunday = plans..sort((a, b) => a.date.compareTo(b.date));
        teamEvents = const [];
      } else {
        final results = await Future.wait([source.events(m, weekStart, weekEnd), source.roles(m)]);
        if (token != _teamToken || _disposed) return;
        teamEvents = (results[0] as List<ScheduleEvent>)..sort(_byDateTime);
        teamRoles = results[1] as List<ScheduleRole>;
        teamSunday = const [];
      }
    } on NoAccessException {
      if (token != _teamToken || _disposed) return;
      ministries = [for (final x in ministries) if (x != m) x];
      teamMinistry = ministries.isEmpty ? null : ministries.first;
      teamError = null;
      loadingTeam = false;
      notifyListeners();
      if (teamMinistry != null) await loadTeam();
      return;
    } catch (_) {
      if (token != _teamToken || _disposed) return;
      teamError = 'Не удалось загрузить расписание. Проверьте интернет и попробуйте снова.';
    }
    loadingTeam = false;
    notifyListeners();
  }

  int _byDateTime(ScheduleEvent a, ScheduleEvent b) {
    final byDate = a.date.compareTo(b.date);
    return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
  }

  /// Подходящие на роль люди: сервер отдаёт тех, чьё служение подходит; остальных можно найти, сняв фильтр.
  Future<List<PersonRef>> candidates(ScheduleRole role, {bool everyone = false}) =>
      source.members(teamMinistry!, roleId: everyone ? null : role.id);

  Future<List<PersonRef>> sundayCandidates() => source.sundayMembers();

  Future<void> assign(ScheduleEvent event, ScheduleRole role, PersonRef person) async {
    await source.assign(event.ministry, planId: event.planId, memberId: person.id, roleId: role.id);
    await _reloadTeamQuietly();
  }

  Future<void> unassign(ScheduleEvent event, ScheduleAssignment assignment) async {
    await source.removeAssignment(event.ministry, assignment.id);
    teamEvents = [
      for (final e in teamEvents)
        if (e.planId == event.planId) e.copyWith(assignments: [for (final a in e.assignments) if (a.id != assignment.id) a]) else e,
    ];
    notifyListeners();
    unawaited(loadMine());
  }

  Future<void> setSunday(SundayPlan plan, {bool leader = false, bool preacher = false, PersonRef? person}) async {
    await source.saveSunday(
      plan,
      setLeader: leader,
      leaderId: leader ? person?.id : null,
      setPreacher: preacher,
      preacherId: preacher ? person?.id : null,
    );
    await _reloadTeamQuietly();
  }

  Future<void> _reloadTeamQuietly() async {
    await loadTeam();
    unawaited(loadMine());
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
