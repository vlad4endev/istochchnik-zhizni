import 'package:flutter/foundation.dart';

import 'data/prayer_source.dart';
import 'logic/prayer_access.dart';
import 'logic/prayer_logic.dart';
import 'models/prayer_models.dart';

/// Срочная нужда и объявление на выбранный день + их правка координатором.
class NotesController extends ChangeNotifier {
  NotesController(this.source);

  final PrayerSource source;
  CoordinatorNotes notes = CoordinatorNotes.empty;
  bool _disposed = false;

  /// Сбой сети заметки не скрывает и страницу не ломает: остаются прежние.
  Future<void> load(DateTime forDate) async {
    try {
      final next = await source.notes(ymdKey(forDate));
      if (_disposed) return;
      notes = next;
    } catch (_) {
      return;
    }
    notifyListeners();
  }

  /// Текущая запись «как в базе» — чтобы подставить срок при правке.
  Future<CoordinatorNote?> noteForEdit(NoteKind kind) async => (await source.manageNotes()).of(kind);

  Future<void> save(NoteKind kind, String text, NoteDuration duration, {DateTime? now}) async {
    final today = now ?? DateTime.now();
    await source.saveNote(kind, text, duration, ymdKey(today));
    await load(today);
  }

  Future<void> remove(NoteKind kind, DateTime forDate) async {
    await source.deleteNote(kind, ymdKey(forDate));
    await load(forDate);
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// «Сбор нужд · очередь недели»: дни, кураторы, правка текста нужды.
class CollectionController extends ChangeNotifier {
  CollectionController(this.source, {required this.meId});

  final PrayerSource source;
  final int meId;

  WeekKind kind = WeekKind.current;
  CollectionFilter filter = CollectionFilter.all;
  String query = '';

  bool loading = true;
  String? error;
  bool claimsFailed = false;
  bool distributing = false;

  /// Участники, для которых сейчас меняется куратор.
  final Set<int> busy = {};

  final Map<WeekKind, List<WeekDay>> _days = {};
  final Map<WeekKind, Claims> _claims = {};
  bool _disposed = false;

  /// Идёт смена куратора у этого участника.
  bool isBusy(int memberId) => busy.contains(memberId);

  List<WeekDay> get days => _days[kind] ?? const [];
  Claims get claims => _claims[kind] ?? Claims.empty;

  List<WeekDay> get visible =>
      filterDays(days, claims, meId, filter: filter, query: query, claimsOk: !claimsFailed);

  CollectionStats get stats => statsFor(days, claims, meId);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load({bool force = false}) async {
    final target = kind;
    if (!force && _days.containsKey(target)) {
      loading = false;
      _notify();
      return;
    }
    loading = !_days.containsKey(target);
    error = null;
    _notify();
    final results = await Future.wait<Object?>([
      source.week(target).then<Object?>((v) => v, onError: (Object e) => e),
      source.claims(target).then<Object?>((v) => v, onError: (Object e) => e),
    ]);
    if (_disposed) return;
    final week = results[0];
    final claims = results[1];
    if (week is List<WeekDay>) {
      _days[target] = week;
    } else if (!_days.containsKey(target)) {
      if (target == kind) error = 'Не удалось загрузить очередь. Проверьте интернет и попробуйте снова.';
    }
    if (claims is Claims) {
      _claims[target] = claims;
      if (target == kind) claimsFailed = false;
    } else if (target == kind) {
      claimsFailed = true;
    }
    if (target == kind) loading = false;
    _notify();
  }

  Future<void> setKind(WeekKind next) async {
    if (next == kind) return;
    kind = next;
    filter = CollectionFilter.all;
    query = '';
    claimsFailed = false;
    error = null;
    await load();
  }

  void setFilter(CollectionFilter value) {
    filter = value;
    _notify();
  }

  void setQuery(String value) {
    query = value;
    _notify();
  }

  /// Назначить куратора (`null` — снять). Ошибку получает вызывающий.
  Future<void> assign(int memberId, int? coordinatorId) async {
    final target = kind;
    if (!busy.add(memberId)) return;
    _notify();
    try {
      _claims[target] = await source.assignCurator(memberId, coordinatorId, target);
    } finally {
      busy.remove(memberId);
      _notify();
    }
  }

  /// Сохранить текст нужды на день цикла: сразу на экране, при ошибке — как было.
  Future<void> saveNeed(WeekDay day, String text) async {
    final member = day.member;
    if (member == null) return;
    final target = kind;
    final before = _days[target] ?? const <WeekDay>[];
    final trimmed = text.trim();
    _days[target] = [
      for (final d in before) d.ymd == day.ymd ? d.withMember(member.withNeed(trimmed)) : d,
    ];
    _notify();
    try {
      await source.saveNeed(member.id, day.ymd, trimmed);
    } catch (_) {
      _days[target] = before;
      _notify();
      rethrow;
    }
  }

  Future<String> improve(String text, String memberName) => source.improveText(text, memberName);

  /// Автораспределение кураторов по правилам нагрузки (+ уведомление кураторов).
  Future<DistributionResult> autoDistribute() async {
    final target = kind;
    distributing = true;
    _notify();
    try {
      final result = await source.autoDistribute(target);
      try {
        _claims[target] = await source.claims(target);
        _days[target] = await source.week(target);
      } catch (_) {
        // Распределение прошло; обновим по pull-to-refresh.
      }
      return result;
    } finally {
      distributing = false;
      _notify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Что показать координатору на главной: «свои» участники или обзор для админа и пастора.
class CoordinatorSummary {
  const CoordinatorSummary({required this.overview, required this.rows, required this.claims, required this.week});

  /// true — админ/пастор: незаполненные нужды всей недели; false — участники куратора.
  final bool overview;
  final List<WeekDay> rows;
  final Claims claims;
  final WeekKind week;

  int get filled => rows.where((d) => d.member?.hasNeed ?? false).length;
}

/// Дополнения главной: заметки координаторов, дни рождения, блок координатора.
/// Каждая часть грузится отдельно: сбой одной не прячет остальные.
class HomeExtrasController extends ChangeNotifier {
  HomeExtrasController(this.source, {required this.access, required this.meId}) : notesController = NotesController(source);

  final PrayerSource source;
  final PrayerAccess access;
  final int meId;
  final NotesController notesController;

  List<Birthday> birthdays = const [];
  CoordinatorSummary? coordinator;
  bool _disposed = false;

  CoordinatorNotes get notes => notesController.notes;

  Future<void> load(DateTime now) async {
    await Future.wait([
      notesController.load(now),
      _loadBirthdays(now),
      _loadCoordinator(now),
    ]);
  }

  Future<void> _loadBirthdays(DateTime now) async {
    try {
      final all = await source.birthdays();
      if (_disposed) return;
      birthdays = upcomingBirthdays(all, now);
      notifyListeners();
    } catch (_) {
      // Дни рождения — необязательный блок.
    }
  }

  Future<void> _loadCoordinator(DateTime now) async {
    if (!access.canViewCollection) return;
    final overview = access.seesWholeQueue;
    final week = overview ? WeekKind.current : WeekKind.next;
    try {
      final results = await Future.wait<Object>([source.week(week), source.claims(week)]);
      if (_disposed) return;
      final days = results[0] as List<WeekDay>;
      final claims = results[1] as Claims;
      coordinator = CoordinatorSummary(
        overview: overview,
        rows: overview ? unfilledFrom(days, ymdKey(now)) : assignedTo(days, claims, meId),
        claims: claims,
        week: week,
      );
      notifyListeners();
    } catch (_) {
      // Без сети блок координатора просто не показываем: в «Молитве» есть полная версия.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    notesController.dispose();
    super.dispose();
  }
}
