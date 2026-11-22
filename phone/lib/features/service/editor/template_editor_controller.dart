import 'package:flutter/foundation.dart';

import '../../../core/church_api.dart' show describeDio;
import 'data/editor_source.dart';
import 'logic/editor_logic.dart';
import 'models/editor_models.dart';

/// Редактор шаблона. В отличие от программы сохраняется явной кнопкой, как на сайте.
class TemplateEditorController extends ChangeNotifier {
  TemplateEditorController(this.source, {this.templateId});

  final PlanEditorSource source;

  /// null — новый шаблон.
  final int? templateId;

  bool loading = true;
  String? error;
  TemplateDraft? draft;
  List<BlockType> types = const [];
  List<Member> members = const [];
  List<PlanTemplate> others = const [];
  List<SongChoice>? _songs;
  bool dirty = false;
  bool saving = false;
  String? saveError;
  int _tmp = 0;
  bool _disposed = false;

  List<SongChoice>? get songs => _songs;
  bool get isNew => draft?.isNew ?? true;

  int _nextTmpId() => --_tmp;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  String _msg(Object e, String fallback) {
    if (e is StateError) return e.message;
    final text = describeDio(e);
    return text == 'Не удалось загрузить данные' ? fallback : text;
  }

  Future<void> load() async {
    loading = draft == null;
    error = null;
    _notify();
    try {
      final lookups = await source.lookups();
      types = lookups.types;
      members = lookups.members;
      try {
        others = await source.allTemplates();
      } catch (_) {
        others = const [];
      }
      if (templateId != null) {
        draft = await source.template(templateId!);
      } else {
        draft ??= TemplateDraft(
          id: 0,
          name: 'Новый шаблон',
          description: '',
          startTime: '10:00',
          active: true,
          rule: weeklyRule(0),
          blocks: [EditorBlock(id: _nextTmpId(), typeId: types.isEmpty ? 1 : types.first.id, title: 'Новый блок 1', order: 0, minutes: 5)],
        );
      }
      dirty = false;
    } catch (e) {
      error = _msg(e, 'Не удалось открыть шаблон');
    }
    loading = false;
    _notify();
  }

  /// Начать с готового черновика (например, из программы).
  void seed(TemplateDraft value) {
    draft = value;
    dirty = true;
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

  void _set(TemplateDraft next) {
    draft = next;
    dirty = true;
    saveError = null;
    _notify();
  }

  void update({String? name, String? description, String? startTime, bool? active, Map<String, dynamic>? rule}) {
    final d = draft;
    if (d == null) return;
    _set(d.copyWith(name: name, description: description, startTime: startTime, active: active, rule: rule));
  }

  void updateBlock(int id, EditorBlock block) {
    final d = draft;
    if (d == null) return;
    _set(d.copyWith(blocks: [for (final b in d.blocks) b.id == id ? block : b]));
  }

  /// Возвращает id нового блока (для немедленного открытия на правку).
  int? addBlock() {
    final d = draft;
    if (d == null || types.isEmpty) return null;
    final id = _nextTmpId();
    _set(d.copyWith(blocks: [...d.blocks, EditorBlock(id: id, typeId: types.first.id, title: 'Новый блок ${d.blocks.length + 1}', order: d.blocks.length, minutes: 5)]));
    return id;
  }

  int? addSeparator() {
    final d = draft;
    if (d == null || types.isEmpty) return null;
    final type = types.firstWhere((t) => t.code == 'custom', orElse: () => types.first).id;
    final id = _nextTmpId();
    _set(d.copyWith(blocks: [...d.blocks, EditorBlock(id: id, typeId: type, title: 'Раздел', order: d.blocks.length, minutes: 1, content: const {'is_separator': true, 'separator_text': 'Новый раздел'})]));
    return id;
  }

  EditorBlock? delete(int id) {
    final d = draft;
    if (d == null) return null;
    EditorBlock? removed;
    final rest = <EditorBlock>[];
    for (final b in d.blocks) {
      if (b.id == id) {
        removed = b;
      } else {
        rest.add(b);
      }
    }
    _set(d.copyWith(blocks: renumber(rest)));
    return removed;
  }

  /// Вернуть удалённый блок на прежнее место («Отменить»).
  void restore(EditorBlock block) {
    final d = draft;
    if (d == null) return;
    final list = [...d.blocks]..insert(block.order.clamp(0, d.blocks.length), block);
    _set(d.copyWith(blocks: renumber(list)));
  }

  void reorder(int oldIndex, int newIndex) {
    final d = draft;
    if (d == null) return;
    final sorted = [...d.blocks]..sort((a, b) => a.order.compareTo(b.order));
    _set(d.copyWith(blocks: reorderBlocks(sorted, oldIndex, newIndex)));
  }

  /// «Подтянуть из другого шаблона»: блоки, время, повтор и описание заменяются.
  /// У нового шаблона название — «… (копия)», у существующего остаётся своё.
  Future<bool> importFrom(int sourceId) async {
    final d = draft;
    if (d == null) return false;
    try {
      final src = await source.template(sourceId);
      _set(d.copyWith(
        name: d.isNew ? '${src.name} (копия)' : d.name,
        description: src.description,
        startTime: src.startTime,
        rule: src.rule,
        blocks: [for (var i = 0; i < src.blocks.length; i++) src.blocks[i].copyWith(order: i)]
            .map((b) => EditorBlock(id: _nextTmpId(), typeId: b.typeId, title: b.title, order: b.order, minutes: b.minutes, assignedId: b.assignedId, songId: b.songId, content: b.content))
            .toList(),
      ));
      return true;
    } catch (e) {
      saveError = _msg(e, 'Не удалось взять данные шаблона');
      _notify();
      return false;
    }
  }

  /// Сохраняет; возвращает id шаблона или null при ошибке (текст в [saveError]).
  Future<int?> save() async {
    final d = draft;
    if (d == null || saving) return null;
    final problem = validateTemplate(d);
    if (problem != null) {
      saveError = problem;
      _notify();
      return null;
    }
    saving = true;
    saveError = null;
    _notify();
    try {
      final int id;
      if (d.isNew) {
        id = await source.createTemplate(templatePayload(d));
      } else {
        id = d.id;
        await source.patchTemplate(id, templatePayload(d, withActive: true));
      }
      dirty = false;
      return id;
    } catch (e) {
      saveError = _msg(e, 'Не удалось сохранить шаблон');
      return null;
    } finally {
      saving = false;
      _notify();
    }
  }

  Future<bool> remove() async {
    final d = draft;
    if (d == null || d.isNew) return false;
    saving = true;
    _notify();
    try {
      await source.deleteTemplate(d.id);
      return true;
    } catch (e) {
      saveError = _msg(e, 'Не удалось удалить шаблон');
      return false;
    } finally {
      saving = false;
      _notify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
