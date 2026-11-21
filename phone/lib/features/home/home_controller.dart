import 'package:flutter/foundation.dart';

import '../prayer/logic/prayer_logic.dart' show ymdKey;
import '../schedule/data/schedule_repository.dart';
import '../schedule/logic/ministry_access.dart';
import '../schedule/models/schedule_models.dart';
import 'data/home_source.dart';
import 'logic/home_logic.dart';
import 'models/home_models.dart';

/// Данные главной. Каждая часть грузится сама по себе: сбой одной не прячет остальные,
/// а при обновлении прежние значения остаются, пока не придут новые.
class HomeController extends ChangeNotifier {
  HomeController(this.source, this.schedule, {required this.meId, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final HomeSource source;
  final ScheduleSource schedule;
  final int meId;
  final DateTime Function() _clock;

  Map<String, dynamic> day = const {};
  List<dynamic> events = const [];
  List<Episode> episodes = const [];
  BroadcastInfo? broadcast;
  ServiceCardData? service;
  List<MyServiceCard> myService = const [];

  /// Первая загрузка идёт, и показывать ещё нечего.
  bool loading = true;

  /// Не пришло вообще ничего (нет сети и нет копий).
  String? error;

  /// Карточки, на которые сейчас отвечают («подтвердить» / «отказать»).
  final Set<String> answering = {};
  String? answerError;

  bool _disposed = false;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// Результат или null, если запрос не удался.
  Future<T?> _try<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (_) {
      return null;
    }
  }

  /// Как [_try], но отличает «ответ: пусто» от «запрос не удался».
  Future<({bool ok, T value})> _attempt<T>(Future<T> Function() call, T fallback) async {
    try {
      return (ok: true, value: await call());
    } catch (_) {
      return (ok: false, value: fallback);
    }
  }

  Future<void> load() async {
    final now = _clock();
    final firstTime = _isEmpty;
    loading = firstTime;
    error = null;
    _notify();
    final results = await Future.wait<Object?>([
      _try<Map<String, dynamic>>(() => source.day(ymdKey(now))),
      _try<List<dynamic>>(source.events),
      _try<List<Episode>>(source.episodes),
      _attempt<BroadcastInfo?>(source.broadcast, null),
      _loadService(now),
    ]);
    if (_disposed) return;
    final dayResult = results[0] as Map<String, dynamic>?;
    final eventsResult = results[1] as List<dynamic>?;
    final episodesResult = results[2] as List<Episode>?;
    if (dayResult != null) day = dayResult;
    if (eventsResult != null) events = eventsResult;
    if (episodesResult != null) episodes = episodesResult;
    // «Трансляции нет» — тоже ответ, а вот сбой сети прежнее значение не затирает.
    final broadcastResult = results[3] as ({bool ok, BroadcastInfo? value});
    if (broadcastResult.ok) broadcast = broadcastResult.value;
    final serviceResult = results[4] as _ServiceLoad;
    if (serviceResult.ok) service = serviceResult.card;
    if (dayResult == null && eventsResult == null && episodesResult == null && !serviceResult.ok && firstTime) {
      error = 'Не удалось загрузить главную. Проверьте интернет и попробуйте снова.';
    }
    loading = false;
    _notify();
    await _loadMyService(now);
  }

  bool get _isEmpty => day.isEmpty && events.isEmpty && episodes.isEmpty && service == null;

  Future<_ServiceLoad> _loadService(DateTime now) async {
    try {
      final plans = await source.plans(DateTime(now.year, now.month, now.day));
      final plan = pickNearestPlan(plans, now);
      if (plan == null || plan.preacherId == null) return const _ServiceLoad(ok: true);
      final blocks = await source.planBlocks(plan.id);
      final sermon = sermonOf(blocks);
      if (sermon == null) return const _ServiceLoad(ok: true);
      final people = await Future.wait<ServicePerson?>([
        _try<ServicePerson?>(() => source.person(plan.preacherId!)),
        if (plan.leaderId != null) _try<ServicePerson?>(() => source.person(plan.leaderId!)),
      ]);
      final preacher = people[0] ?? ServicePerson(id: plan.preacherId!, name: 'Проповедник');
      final host = plan.leaderId == null ? null : (people[1] ?? ServicePerson(id: plan.leaderId!, name: 'Ведущий'));
      return _ServiceLoad(
        ok: true,
        card: ServiceCardData(
          planId: plan.id,
          shareToken: plan.shareToken,
          startsAt: planStart(plan)!,
          phase: planPhase(plan, now),
          preacher: ServicePerson(
            id: preacher.id,
            name: preacher.name.isEmpty ? 'Проповедник' : preacher.name,
            avatarUrl: preacher.avatarUrl,
          ),
          host: host == null ? null : ServicePerson(id: host.id, name: host.name.isEmpty ? 'Ведущий' : host.name, avatarUrl: host.avatarUrl),
          topic: sermon.topic,
          scripture: sermon.scripture,
        ),
      );
    } catch (_) {
      return const _ServiceLoad(ok: false);
    }
  }

  /// «Твоё служение на этой неделе»: музыка, трансляция и воскресное собрание.
  Future<void> _loadMyService(DateTime now) async {
    if (meId <= 0) return;
    final sunday = anchorSunday(service == null ? null : DateTime(service!.startsAt.year, service!.startsAt.month, service!.startsAt.day), now);
    final to = now.add(const Duration(days: 28));
    Future<List<T>?> mine<T>(Future<MineResult<T>> Function() call) async {
      try {
        return (await call()).items;
      } on NoAccessException {
        return const [];
      } catch (_) {
        return null;
      }
    }

    final results = await Future.wait<Object?>([
      mine(() => schedule.myEvents(Ministry.music, now, to)),
      mine(() => schedule.myEvents(Ministry.media, now, to)),
      mine(() => schedule.mySunday(sunday, sunday)),
    ]);
    if (_disposed) return;
    if (results.every((r) => r == null)) return; // нет сети: остаётся прежнее
    myService = buildMyService(
      sunday: sunday,
      memberId: meId,
      music: (results[0] as List<ScheduleEvent>?) ?? const [],
      media: (results[1] as List<ScheduleEvent>?) ?? const [],
      sundayPlans: (results[2] as List<SundayPlan>?) ?? const [],
    );
    _notify();
  }

  /// Ответить на все ожидающие позиции карточки. Ошибка остаётся в [answerError].
  Future<void> answer(MyServiceCard card, AssignmentStatus status) async {
    if (!answering.add(card.key)) return;
    answerError = null;
    _notify();
    final ministry = card.ministry == ServiceMinistry.media ? Ministry.media : Ministry.music;
    try {
      await Future.wait([for (final role in card.pending) schedule.setStatus(ministry, role.assignmentId!, status)]);
    } catch (_) {
      answerError = 'Не удалось сохранить ответ. Проверьте интернет и попробуйте снова.';
    } finally {
      answering.remove(card.key);
    }
    _notify();
    await _loadMyService(_clock());
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

class _ServiceLoad {
  const _ServiceLoad({required this.ok, this.card});
  final bool ok;
  final ServiceCardData? card;
}
