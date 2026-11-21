import 'package:flutter/painting.dart';
import 'package:molitva/features/schedule/data/schedule_repository.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';

const ivan = PersonRef(id: 1, name: 'Иван Петров');
const maria = PersonRef(id: 2, name: 'Мария Сидорова');

ScheduleRole role(int id, String name, [int color = 0xFF0891B2]) => ScheduleRole(id: id, name: name, color: Color(color));

ScheduleAssignment assignment(int id, PersonRef who, ScheduleRole r, [AssignmentStatus status = AssignmentStatus.assigned]) =>
    ScheduleAssignment(id: id, memberId: who.id, memberName: who.name, role: r, status: status);

ScheduleEvent event(Ministry m, int planId, DateTime date, List<ScheduleAssignment> assignments, {String time = '11:00', String title = 'Воскресное служение'}) =>
    ScheduleEvent(ministry: m, planId: planId, title: title, date: date, startTime: time, assignments: assignments);

/// Источник без сети: ответы задаются в полях, ошибки — флагами.
class FakeScheduleSource implements ScheduleSource {
  final mine = <Ministry, List<ScheduleEvent>>{};
  List<SundayPlan> mineSunday = [];
  final team = <Ministry, List<ScheduleEvent>>{};
  List<SundayPlan> teamSunday = [];
  List<ScheduleRole> roleList = [role(1, 'Звук'), role(2, 'Камера')];
  List<PersonRef> memberList = [ivan, maria];

  final denied = <Ministry>{};
  final failing = <Ministry>{};
  DateTime? staleSince;
  bool statusFails = false;
  bool assignFails = false;

  final statusCalls = <(Ministry, int, AssignmentStatus)>[];
  final assignCalls = <(int, int, int)>[];
  final removed = <int>[];
  final sundaySaves = <Map<String, Object?>>[];
  final eventRanges = <(DateTime, DateTime)>[];

  void _check(Ministry m) {
    if (denied.contains(m)) throw NoAccessException(m);
    if (failing.contains(m)) throw Exception('нет сети');
  }

  @override
  Future<MineResult<ScheduleEvent>> myEvents(Ministry ministry, DateTime from, DateTime to) async {
    _check(ministry);
    return MineResult(mine[ministry] ?? const [], staleSince: staleSince);
  }

  @override
  Future<MineResult<SundayPlan>> mySunday(DateTime from, DateTime to) async {
    _check(Ministry.sunday);
    return MineResult(mineSunday, staleSince: staleSince);
  }

  @override
  Future<List<ScheduleEvent>> events(Ministry ministry, DateTime from, DateTime to) async {
    _check(ministry);
    eventRanges.add((from, to));
    return [...?team[ministry]];
  }

  @override
  Future<List<SundayPlan>> sundayPlans(DateTime from, DateTime to) async {
    _check(Ministry.sunday);
    eventRanges.add((from, to));
    return [...teamSunday];
  }

  @override
  Future<List<ScheduleRole>> roles(Ministry ministry) async => roleList;

  @override
  Future<List<PersonRef>> members(Ministry ministry, {int? roleId}) async => memberList;

  @override
  Future<List<PersonRef>> sundayMembers() async => memberList;

  @override
  Future<void> assign(Ministry ministry, {required int planId, required int memberId, required int roleId}) async {
    if (assignFails) throw Exception('конфликт');
    assignCalls.add((planId, memberId, roleId));
  }

  @override
  Future<void> removeAssignment(Ministry ministry, int assignmentId) async => removed.add(assignmentId);

  @override
  Future<void> setStatus(Ministry ministry, int assignmentId, AssignmentStatus status) async {
    if (statusFails) throw Exception('нет сети');
    statusCalls.add((ministry, assignmentId, status));
  }

  @override
  Future<void> saveSunday(SundayPlan plan, {bool setLeader = false, int? leaderId, bool setPreacher = false, int? preacherId}) async {
    sundaySaves.add({'plan': plan.id, 'setLeader': setLeader, 'leader': leaderId, 'setPreacher': setPreacher, 'preacher': preacherId});
  }
}
