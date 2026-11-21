import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/church_api.dart' show describeDio;
import 'data/editor_source.dart';
import 'logic/editor_logic.dart';
import 'models/editor_models.dart';

enum SaveStatus { idle, saving, saved, error }

/// Состояние редактора программы: черновик, автосохранение, структурные правки.
class PlanEditorController extends ChangeNotifier {
  PlanEditorController(this.source, this.planId, {this.canManage = false, this.debounce = const Duration(milliseconds: 800)});

  final PlanEditorSource source;
  final int planId;

  /// Можно ли менять настройки плана (дата, время, ответственные, статус).
  final bool canManage;
  final Duration debounce;

  bool loading = true;
  String? error;
  PlanDraft? draft;
  EditorLookups lookups = const EditorLookups(types: [], members: []);
  SaveStatus saveStatus = SaveStatus.idle;
  String? saveError;

  /// Идёт создание/удаление/публикация — кнопки блокируются.
  bool busy = false;

  List<SongChoice>? _songs;
  Timer? _timer;
  bool _settingsDirty = false;
  final Set<int> _dirtyBlocks = {};
  bool _saving = false;
  bool _disposed = false;

  List<SongChoice>? get songs => _songs;

  List<PlanSlot> get timed => draft == null ? const [] : timedBlocks(draft!);
  int get total => draft == null ? 0 : totalMinutes(draft!.blocks);
  bool get hasUnsaved => _settingsDirty || _dirtyBlocks.isNotEmpty;

  BlockType? typeOf(EditorBlock b) => lookups.typesById[b.typeId];
  Member? member(int? id) => id == null ? null : lookups.membersById[id];

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    loading = draft == null;
    error = null;
    _notify();
    try {
      final results = await Future.wait<Object>([source.plan(planId), source.lookups()]);
      if (_disposed) return;
      lookups = results[1] as EditorLookups;
      final plan = results[0] as PlanDraft;
      draft = plan.copyWith(blocks: applyResponsibles(plan, lookups.typesById, lookups.membersById));
      _settingsDirty = false;
      _dirtyBlocks.clear();
    } catch (e) {
      if (_disposed) return;
      error = _message(e, 'Не удалось открыть программу');
    }
    loading = false;
    _notify();
  }

  Future<void> loadSongs() async {
    if (_songs != null) return;
    try {
      _songs = await source.songs();
    } catch (_) {
      _songs = const [];
    }
    _notify();
  }

  String _message(Object e, String fallback) {
    if (e is StateError) return e.message;
    final text = describeDio(e);
    return text == 'Не удалось загрузить данные' ? fallback : text;
  }

  // ───── автосохранение ─────

  void _markBlock(int id) {
    _dirtyBlocks.add(id);
    _schedule();
  }

  void _markSettings() {
    _settingsDirty = true;
    _schedule();
  }

  void _schedule() {
    saveStatus = SaveStatus.saving;
    _timer?.cancel();
    _timer = Timer(debounce, () => unawaited(flush()));
    _notify();
  }

  /// Сохраняет всё, что изменено. Безопасно вызывать повторно (в т.ч. при выходе).
  Future<bool> flush() async {
    _timer?.cancel();
    if (_saving) {
      // Идущее сохранение подхватит новые правки на следующем круге.
      return _waitIdle();
    }
    _saving = true;
    var ok = true;
    try {
      while (hasUnsaved && !_disposed) {
        final plan = draft;
        if (plan == null) break;
        final blocks = _dirtyBlocks.toList();
        final settings = _settingsDirty;
        _dirtyBlocks.clear();
        _settingsDirty = false;
        saveStatus = SaveStatus.saving;
        _notify();
        try {
          for (final id in blocks) {
            final b = _block(id);
            if (b != null) await source.patchBlock(id, b.toPatch());
          }
          if (settings && canManage) await source.patchPlan(plan.id, _settingsBody(plan));
        } catch (e) {
          // Вернём в очередь, чтобы «Повторить» не потерял правки.
          _dirtyBlocks.addAll(blocks);
          _settingsDirty = _settingsDirty || settings;
          saveError = _message(e, 'Не удалось сохранить');
          saveStatus = SaveStatus.error;
          ok = false;
          break;
        }
      }
      if (ok) {
        saveError = null;
        saveStatus = draft == null ? SaveStatus.idle : SaveStatus.saved;
      }
    } finally {
      _saving = false;
    }
    _notify();
    return ok;
  }

  Future<bool> _waitIdle() async {
    while (_saving && !_disposed) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    return hasUnsaved ? flush() : saveStatus != SaveStatus.error;
  }

  Map<String, dynamic> _settingsBody(PlanDraft p) => {
        'service_date': ymd(p.date),
        'start_time': p.startTime,
        'leader_member_id': p.leaderId,
        'preacher_member_id': p.preacherId,
        'music_ministry_member_id': p.musicId,
        'poem_ministry_member_id': p.poemId,
        'current_block_id': p.currentBlockId,
      };

  EditorBlock? _block(int id) {
    final d = draft;
    if (d == null) return null;
    for (final b in d.blocks) {
      if (b.id == id) return b;
    }
    return null;
  }

  // ───── правки ─────

  void updateBlock(int id, EditorBlock Function(EditorBlock) change) {
    final d = draft;
    if (d == null) return;
    draft = d.copyWith(blocks: [for (final b in d.blocks) b.id == id ? change(b) : b]);
    _markBlock(id);
  }

  void updateSettings({DateTime? date, String? startTime, Object? leaderId = _unset, Object? preacherId = _unset, Object? musicId = _unset, Object? poemId = _unset}) {
    final d = draft;
    if (d == null || !canManage) return;
    var next = d.copyWith(
      date: date,
      startTime: startTime,
      leaderId: identical(leaderId, _unset) ? d.leaderId : leaderId as int?,
      preacherId: identical(preacherId, _unset) ? d.preacherId : preacherId as int?,
      musicId: identical(musicId, _unset) ? d.musicId : musicId as int?,
      poemId: identical(poemId, _unset) ? d.poemId : poemId as int?,
    );
    final responsiblesChanged = next.preacherId != d.preacherId || next.musicId != d.musicId;
    if (responsiblesChanged) {
      final normalized = applyResponsibles(next, lookups.typesById, lookups.membersById);
      for (var i = 0; i < normalized.length; i++) {
        if (normalized[i].assignedId != next.blocks[i].assignedId || normalized[i].title != next.blocks[i].title) {
          _dirtyBlocks.add(normalized[i].id);
        }
      }
      next = next.copyWith(blocks: normalized);
    }
    draft = next;
    _markSettings();
  }

  static const Object _unset = Object();

  /// Новый блок (по умолчанию — первый тип, как на сайте). Возвращает id или null при ошибке.
  Future<int?> addBlock({int? typeId}) async {
    final d = draft;
    final type = typeId ?? (lookups.types.isEmpty ? null : lookups.types.first.id);
    if (d == null || type == null) return null;
    return _create(d, type, 'Новый блок', 5, const {});
  }

  Future<int?> addSeparator() async {
    final d = draft;
    if (d == null || lookups.types.isEmpty) return null;
    final type = lookups.types.firstWhere((t) => t.code == 'custom', orElse: () => lookups.types.first).id;
    return _create(d, type, 'Раздел', 1, const {'is_separator': true, 'separator_text': 'Новый раздел'});
  }

  Future<int?> _create(PlanDraft d, int type, String title, int minutes, Map<String, dynamic> content) async {
    busy = true;
    _notify();
    try {
      final id = await source.createBlock(planId: d.id, typeId: type, title: title, minutes: minutes, content: content);
      final cur = draft;
      if (cur != null) {
        draft = cur.copyWith(blocks: [
          ...cur.blocks,
          EditorBlock(id: id, typeId: type, title: title, order: cur.blocks.length, minutes: minutes, content: content),
        ]);
      }
      return id;
    } catch (e) {
      saveError = _message(e, 'Не удалось добавить блок');
      saveStatus = SaveStatus.error;
      return null;
    } finally {
      busy = false;
      _notify();
    }
  }

  /// Удаляет сразу (как на сайте). Возвращает снимок для «Отменить» или null при ошибке.
  Future<EditorBlock?> deleteBlock(int id) async {
    final d = draft;
    final block = _block(id);
    if (d == null || block == null) return null;
    _dirtyBlocks.remove(id);
    draft = d.copyWith(blocks: renumber([for (final b in d.blocks) if (b.id != id) b]));
    _notify();
    try {
      await source.deleteBlock(id);
      return block;
    } catch (e) {
      // Сервер не удалил — возвращаем блок на место.
      final cur = draft;
      if (cur != null) {
        final list = [...cur.blocks, block];
        list.sort((a, b) => a.order.compareTo(b.order));
        draft = cur.copyWith(blocks: list);
      }
      saveError = _message(e, 'Не удалось удалить блок');
      saveStatus = SaveStatus.error;
      _notify();
      return null;
    }
  }

  /// «Отменить» удаление: блок создаётся заново (id новый) на прежнем месте.
  Future<void> restoreBlock(EditorBlock snapshot) async {
    final d = draft;
    if (d == null) return;
    try {
      final id = await source.createBlock(planId: d.id, typeId: snapshot.typeId, title: snapshot.title, minutes: snapshot.minutes, content: snapshot.content);
      final restored = snapshot.copyWith(order: snapshot.order);
      final fresh = EditorBlock(id: id, typeId: restored.typeId, title: restored.title, order: 0, minutes: restored.minutes, assignedId: restored.assignedId, songId: restored.songId, content: restored.content);
      final list = [...draft!.blocks];
      final at = snapshot.order.clamp(0, list.length);
      list.insert(at, fresh);
      draft = draft!.copyWith(blocks: renumber(list));
      // Ответственный и песня не передаются при создании — досохраняем.
      _markBlock(id);
      _notify();
      await source.reorder(d.id, [for (final b in draft!.blocks) b.id]);
    } catch (e) {
      saveError = _message(e, 'Не удалось вернуть блок');
      saveStatus = SaveStatus.error;
      _notify();
    }
  }

  /// Перетаскивание (индексы ReorderableListView).
  Future<void> reorder(int oldIndex, int newIndex) async {
    final d = draft;
    if (d == null) return;
    final sorted = [...d.blocks]..sort((a, b) => a.order.compareTo(b.order));
    final next = reorderBlocks(sorted, oldIndex, newIndex);
    draft = d.copyWith(blocks: next);
    _notify();
    try {
      await source.reorder(d.id, [for (final b in next) b.id]);
    } catch (e) {
      saveError = _message(e, 'Не удалось изменить порядок');
      saveStatus = SaveStatus.error;
      await load();
    }
  }

  /// Публикация / возврат в черновик. Сначала сохраняются блоки (песни и ответственные),
  /// затем статус — иначе сервер соберёт сетлист по устаревшим данным.
  Future<PublishResult?> togglePublish({bool? sendNotify}) async {
    final d = draft;
    if (d == null) return null;
    final next = !d.published;
    busy = true;
    _notify();
    try {
      for (final b in d.blocks) {
        _dirtyBlocks.add(b.id);
      }
      if (!await flush()) return null;
      final body = <String, dynamic>{'status': next ? 'published' : 'draft'};
      if (canManage) body.addAll(_settingsBody(d));
      if (next && sendNotify != null) body['send_published_notify'] = sendNotify;
      final result = await source.patchPlan(d.id, body);
      draft = draft!.copyWith(published: next, notifySentAt: result.notify == 'sent' ? DateTime.now() : null);
      saveStatus = SaveStatus.saved;
      return result;
    } catch (e) {
      saveError = _message(e, 'Не удалось изменить статус');
      saveStatus = SaveStatus.error;
      return null;
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<bool> setArchived(bool archived) async {
    final d = draft;
    if (d == null) return false;
    busy = true;
    _notify();
    try {
      await flush();
      await source.patchPlan(d.id, {'is_archived': archived});
      draft = draft!.copyWith(archived: archived);
      return true;
    } catch (e) {
      saveError = _message(e, 'Не удалось изменить архив');
      saveStatus = SaveStatus.error;
      return false;
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<bool> deletePlan() async {
    final d = draft;
    if (d == null) return false;
    busy = true;
    _notify();
    try {
      _timer?.cancel();
      _dirtyBlocks.clear();
      _settingsDirty = false;
      await source.deletePlan(d.id);
      return true;
    } catch (e) {
      saveError = _message(e, 'Не удалось удалить программу');
      saveStatus = SaveStatus.error;
      return false;
    } finally {
      busy = false;
      _notify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
