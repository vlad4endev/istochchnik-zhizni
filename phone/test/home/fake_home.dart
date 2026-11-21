import 'dart:async';

import 'package:molitva/features/home/data/home_source.dart';
import 'package:molitva/features/home/models/home_models.dart';
import 'package:molitva/features/schedule/data/schedule_repository.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';
import 'package:molitva/features/service/models/plan_models.dart';

/// Главная без сети: каждая часть отдаётся из полей, а сбои включаются по отдельности.
class FakeHome implements HomeSource {
  final calls = <String>[];

  Map<String, dynamic> dayNow = {
    'members': [
      {'id': 1, 'name': 'Эдуард Толстошеин', 'prayer_request': 'x'},
    ],
  };
  List<dynamic> eventsNow = const [];
  List<Episode> episodesNow = const [];
  BroadcastInfo? broadcastNow;
  List<PlanSummary> plansNow = const [];
  Map<int, List<PlanBlock>> blocks = {};
  Map<int, ServicePerson?> people = {};

  bool failDay = false;
  bool failEvents = false;
  bool failEpisodes = false;
  bool failBroadcast = false;
  bool failPlans = false;
  bool failAll = false;

  void _guard(bool fail, String what) {
    calls.add(what);
    if (fail || failAll) throw StateError('net:$what');
  }

  @override
  Future<Map<String, dynamic>> day(String iso) async {
    _guard(failDay, 'day:$iso');
    return dayNow;
  }

  @override
  Future<List<dynamic>> events() async {
    _guard(failEvents, 'events');
    return eventsNow;
  }

  @override
  Future<List<Episode>> episodes() async {
    _guard(failEpisodes, 'episodes');
    return episodesNow;
  }

  @override
  Future<BroadcastInfo?> broadcast() async {
    _guard(failBroadcast, 'broadcast');
    return broadcastNow;
  }

  @override
  Future<List<PlanSummary>> plans(DateTime from) async {
    _guard(failPlans, 'plans');
    return plansNow;
  }

  @override
  Future<List<PlanBlock>> planBlocks(int planId) async {
    calls.add('blocks:$planId');
    return blocks[planId] ?? const [];
  }

  @override
  Future<ServicePerson?> person(int memberId) async {
    calls.add('person:$memberId');
    if (!people.containsKey(memberId)) throw StateError('no profile');
    return people[memberId];
  }
}

/// «Моё расписание»: только то, что нужно главной.
class FakeSchedule implements ScheduleSource {
  final calls = <String>[];
  List<ScheduleEvent> music = const [];
  List<ScheduleEvent> media = const [];
  List<SundayPlan> sunday = const [];
  bool noAccessMusic = false;
  bool fail = false;
  bool failStatus = false;

  @override
  Future<MineResult<ScheduleEvent>> myEvents(Ministry ministry, DateTime from, DateTime to) async {
    calls.add('mine:${ministry.name}');
    if (fail) throw StateError('net');
    if (ministry == Ministry.music && noAccessMusic) throw NoAccessException(ministry);
    return MineResult(ministry == Ministry.music ? music : media);
  }

  @override
  Future<MineResult<SundayPlan>> mySunday(DateTime from, DateTime to) async {
    calls.add('mineSunday');
    if (fail) throw StateError('net');
    return MineResult(sunday);
  }

  @override
  Future<void> setStatus(Ministry ministry, int assignmentId, AssignmentStatus status) async {
    calls.add('status:${ministry.name}:$assignmentId:${status.name}');
    if (failStatus) throw StateError('net');
    // Сервер запомнил ответ: «мои» назначения теперь с новым статусом.
    List<ScheduleEvent> apply(List<ScheduleEvent> events) => [
          for (final e in events)
            e.copyWith(assignments: [for (final a in e.assignments) a.id == assignmentId ? a.withStatus(status) : a]),
        ];
    if (ministry == Ministry.music) music = apply(music);
    if (ministry == Ministry.media) media = apply(media);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('${invocation.memberName}');
}
