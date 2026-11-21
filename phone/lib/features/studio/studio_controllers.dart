import 'package:flutter/foundation.dart';

import 'data/studio_repository.dart';
import 'models/studio_models.dart';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Список сетлистов: ближайшие, без даты и прошедшие.
class StudioController extends ChangeNotifier {
  StudioController(this.source, {required this.userId, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final StudioSource source;
  final int userId;
  final DateTime Function() _clock;

  bool loading = true;
  String? error;
  DateTime? staleSince;
  List<Setlist> _all = const [];
  bool _disposed = false;

  DateTime get today => _day(_clock());

  bool get hasSetlists => _all.isNotEmpty;

  /// Ближайший первым.
  List<Setlist> get upcoming => ([for (final s in _all) if (s.date != null && !s.date!.isBefore(today)) s]..sort((a, b) => a.date!.compareTo(b.date!)));

  List<Setlist> get undated => [for (final s in _all) if (s.date == null) s];

  /// Недавний первым.
  List<Setlist> get past => ([for (final s in _all) if (s.date != null && s.date!.isBefore(today)) s]..sort((a, b) => b.date!.compareTo(a.date!)));

  bool isMine(Setlist s) => s.ownerId == userId;

  Future<void> load() async {
    loading = _all.isEmpty;
    error = null;
    notifyListeners();
    try {
      final result = await source.setlists();
      if (_disposed) return;
      _all = result.value;
      staleSince = result.staleSince;
    } catch (_) {
      if (_disposed) return;
      error = 'Не удалось загрузить сетлисты. Проверьте интернет и попробуйте снова.';
    }
    loading = false;
    notifyListeners();
  }

  Future<Setlist> create(String title, DateTime? date) async {
    final created = await source.createSetlist(title, date);
    _all = [created, ..._all];
    notifyListeners();
    return created;
  }

  /// Убираем сразу; если сервер не принял — возвращаем на место и сообщаем.
  Future<void> delete(Setlist setlist) async {
    final before = _all;
    _all = [for (final s in _all) if (s.id != setlist.id) s];
    notifyListeners();
    try {
      await source.deleteSetlist(setlist.id);
    } catch (_) {
      _all = before;
      if (!_disposed) notifyListeners();
      rethrow;
    }
  }

  /// Название и дату мог поменять экран сетлиста.
  void replace(Setlist updated) {
    _all = [for (final s in _all) s.id == updated.id ? updated : s];
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Один сетлист: песни, порядок, название, дата и ссылка для команды.
class SetlistController extends ChangeNotifier {
  SetlistController(this.source, {required Setlist initial, required this.userId, required this.origin})
      : detail = SetlistDetail(setlist: initial, items: const []);

  final StudioSource source;
  final int userId;

  /// Адрес сайта: по нему строится ссылка для команды.
  final String origin;

  SetlistDetail detail;
  bool loading = true;
  String? error;
  DateTime? staleSince;
  bool _disposed = false;

  /// Порядок элементов, который сервер подтвердил последним.
  List<int> _confirmedIds = const [];

  /// Хвост очереди отправки порядка: запросы идут строго по одному.
  Future<void> _tail = Future<void>.value();

  Setlist get setlist => detail.setlist;
  List<SetlistItem> get items => detail.items;

  /// Править можно только свой сетлист; сетлисты из программы служения — только смотреть и играть.
  bool get canEdit => setlist.ownerId == userId;

  /// Из кэша без сети править нельзя: изменения не дойдут до сервера.
  bool get editable => canEdit && staleSince == null;

  String get shareUrl => setlist.shareToken.isEmpty ? '' : '$origin/setlist-share/${setlist.shareToken}';

  Future<void> load() async {
    loading = items.isEmpty;
    error = null;
    notifyListeners();
    try {
      final result = await source.performance(setlist.id);
      if (_disposed) return;
      detail = result.value;
      _confirmedIds = [for (final i in items) i.id];
      staleSince = result.staleSince;
    } catch (_) {
      if (_disposed) return;
      error = 'Не удалось загрузить сетлист. Проверьте интернет и попробуйте снова.';
    }
    loading = false;
    notifyListeners();
  }

  Future<void> addSong(int songId, {int? versionId}) async {
    await _tail;
    await source.addItem(setlist.id, songId: songId, versionId: versionId);
    await load();
  }

  Future<void> remove(SetlistItem item) async {
    final before = detail;
    detail = detail.copyWith(items: [for (final i in items) if (i.id != item.id) i]);
    notifyListeners();
    try {
      await source.removeItem(setlist.id, item.id);
      _confirmedIds = [for (final id in _confirmedIds) if (id != item.id) id];
    } catch (_) {
      detail = before;
      if (!_disposed) notifyListeners();
      rethrow;
    }
  }

  /// Перетаскивание в списке: индексы как у ReorderableListView.
  ///
  /// Экран обновляется сразу, а порядок уходит на сервер по очереди: одновременно
  /// летит не больше одного запроса, и каждый несёт актуальный порядок экрана
  /// (быстрые подряд перестановки схлопываются в один запрос).
  Future<void> move(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= items.length) return Future<void>.value();
    var target = newIndex;
    if (target > oldIndex) target -= 1;
    target = target.clamp(0, items.length - 1);
    if (target == oldIndex) return Future<void>.value();
    final next = [...items];
    next.insert(target, next.removeAt(oldIndex));
    detail = detail.copyWith(items: next);
    notifyListeners();
    final job = _tail.then((_) => _flushOrder());
    _tail = job.then((_) {}, onError: (_) {});
    return job;
  }

  Future<void> _flushOrder() async {
    if (_disposed) return;
    final ids = [for (final i in items) i.id];
    if (_sameIds(ids, _confirmedIds)) return;
    try {
      await source.reorder(setlist.id, ids);
      _confirmedIds = ids;
    } catch (_) {
      _restoreConfirmedOrder();
      rethrow;
    }
  }

  /// Откат: возвращаем порядок, подтверждённый сервером (элементы — текущие, по id).
  void _restoreConfirmedOrder() {
    final byId = {for (final i in items) i.id: i};
    final restored = <SetlistItem>[
      for (final id in _confirmedIds) ?byId.remove(id),
      ...byId.values,
    ];
    detail = detail.copyWith(items: restored);
    if (!_disposed) notifyListeners();
  }

  static bool _sameIds(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  Future<void> rename(String title) => _patch(detail.setlist.copyWith(title: title.trim()), title: title.trim());

  Future<void> setDate(DateTime? date) => date == null
      ? _patch(detail.setlist.copyWith(clearDate: true), clearDate: true)
      : _patch(detail.setlist.copyWith(date: DateTime(date.year, date.month, date.day)), date: date);

  Future<void> setPublic(bool value) => _patch(detail.setlist.copyWith(isPublic: value), isPublic: value);

  Future<void> _patch(Setlist next, {String? title, DateTime? date, bool clearDate = false, bool? isPublic}) async {
    final before = detail;
    detail = detail.copyWith(setlist: next);
    notifyListeners();
    try {
      await source.patchSetlist(setlist.id, title: title, date: date, clearDate: clearDate, isPublic: isPublic);
    } catch (_) {
      detail = before;
      if (!_disposed) notifyListeners();
      rethrow;
    }
  }

  Future<void> deleteSetlist() => source.deleteSetlist(setlist.id);

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
