import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../../core/church_api.dart' show describeDio;
import '../../../core/session.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import 'data/editor_source.dart';
import 'logic/editor_logic.dart';
import 'models/editor_models.dart';
import 'template_editor_controller.dart';
import 'widgets/block_editor_sheet.dart';
import 'widgets/block_tile.dart';

/// Шаблоны программ: список, создание, правка. Доступно админу, служителю и ведущему.
class TemplatesPage extends StatefulWidget {
  const TemplatesPage({super.key, this.source});

  final PlanEditorSource? source;

  @override
  State<TemplatesPage> createState() => _TemplatesPageState();
}

class _TemplatesPageState extends State<TemplatesPage> {
  late final PlanEditorSource _source = widget.source ?? PlanEditorApi(context.read<SessionController>());
  bool _loading = true;
  String? _error;
  List<PlanTemplate> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final list = await _source.allTemplates();
      if (mounted) {
        setState(() {
          _items = list;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = describeDio(e);
          _loading = false;
        });
      }
    }
  }

  Future<void> _open({int? id}) async {
    await pushPage(context, TemplateEditorPage(templateId: id, source: _source));
    if (mounted) unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    return ChurchPage(
      title: 'Шаблоны',
      subtitle: 'Основа новых программ',
      floatingActionButton: ChurchFab(circle: true, tooltip: 'Новый шаблон', onPressed: () => _open()),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('Шаблонов пока нет', icon: Icons.view_agenda_outlined, hint: 'Нажмите «+», чтобы создать первый: по нему строятся программы служения.')
            : SheetList(
                onRefresh: _load,
                children: [
                  ListGroup(
                    children: [
                      for (final t in _items)
                        ListRow(
                          key: ValueKey('template-row-${t.id}'),
                          leading: IconTile(Icons.view_agenda_outlined, tone: t.active ? Tone.violet : Tone.neutral),
                          title: t.name,
                          subtitle: [ruleSummary(t.rule), 'начало ${t.startTime}'].join(' · '),
                          subtitleMaxLines: 2,
                          trailing: t.active ? null : const StatusPill('Выключен'),
                          onTap: () => _open(id: t.id),
                        ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

enum _TemplateAction { import, delete }

/// Редактор шаблона: название, время, повтор, блоки (перетаскивание, правка), сохранение кнопкой.
class TemplateEditorPage extends StatefulWidget {
  const TemplateEditorPage({super.key, this.templateId, this.source, this.seed});

  final int? templateId;
  final PlanEditorSource? source;

  /// Готовый черновик (например, «Сохранить как шаблон» из программы).
  final TemplateDraft? seed;

  @override
  State<TemplateEditorPage> createState() => _TemplateEditorPageState();
}

class _TemplateEditorPageState extends State<TemplateEditorPage> {
  late final TemplateEditorController _c;
  final _name = TextEditingController();
  final _description = TextEditingController();
  bool _fieldsFilled = false;

  @override
  void initState() {
    super.initState();
    final source = widget.source ?? PlanEditorApi(context.read<SessionController>());
    _c = TemplateEditorController(source, templateId: widget.templateId);
    if (widget.seed != null) _c.seed(widget.seed!);
    _c.load().then((_) {
      if (widget.seed != null) _c.seed(widget.seed!);
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _c.dispose();
    super.dispose();
  }

  void _fill(TemplateDraft d) {
    if (_fieldsFilled) return;
    _fieldsFilled = true;
    _name.text = d.name;
    _description.text = d.description;
  }

  Future<bool> _confirm(String title, String text, String action, {bool danger = false}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          FilledButton(style: danger ? FilledButton.styleFrom(backgroundColor: ChurchColors.danger) : null, onPressed: () => Navigator.pop(context, true), child: Text(action)),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _save() async {
    final id = await _c.save();
    if (!mounted) return;
    if (id == null) {
      showMessage(context, _c.saveError ?? 'Не удалось сохранить шаблон');
      return;
    }
    showMessage(context, 'Шаблон сохранён');
    Navigator.of(context).pop(true);
  }

  Future<void> _editBlock(EditorBlock block) async {
    final d = _c.draft;
    if (d == null) return;
    final edited = await showBlockEditor(
      context,
      block: block,
      types: _c.types,
      members: _c.members,
      plan: _dummyPlan(d),
      forTemplate: true,
      loadSongs: () async {
        await _c.loadSongs();
        return _c.songs;
      },
    );
    if (edited != null) _c.updateBlock(block.id, edited);
  }

  PlanDraft _dummyPlan(TemplateDraft d) => PlanDraft(id: 0, date: DateTime.now(), startTime: d.startTime, published: false, archived: false, blocks: d.blocks);

  void _add({bool separator = false}) {
    final id = separator ? _c.addSeparator() : _c.addBlock();
    if (id == null) return;
    final block = _c.draft!.blocks.firstWhere((b) => b.id == id);
    unawaited(_editBlock(block));
  }

  void _deleteBlock(EditorBlock block) {
    final removed = _c.delete(block.id);
    if (removed == null || !mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(block.isSeparator ? 'Раздел удалён' : 'Блок «${block.title}» удалён'), action: SnackBarAction(label: 'Отменить', onPressed: () => _c.restore(removed))));
  }

  Future<void> _pickTime(TemplateDraft d) async {
    final parts = d.startTime.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.tryParse(parts.first) ?? 10, minute: parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true), child: child!),
    );
    if (picked != null) _c.update(startTime: '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}');
  }

  Future<void> _pickRule(TemplateDraft d) async {
    final current = ruleWeekday(d.rule);
    final custom = d.rule.isNotEmpty && current == null;
    final choice = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheet) => Container(
        decoration: BoxDecoration(color: context.palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
        child: SafeArea(
          child: Material(
            type: MaterialType.transparency,
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 8),
              children: [
                Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text('Когда повторяется', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: context.palette.ink))),
                if (custom) Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text('Сейчас задано своё правило на сайте. Выбор ниже заменит его.', style: TextStyle(fontSize: 13, color: context.palette.inkMuted))),
                for (var i = 0; i < 7; i++)
                  ListTile(
                    key: ValueKey('rule-$i'),
                    minTileHeight: 52,
                    title: Text('Каждую неделю: ${weekdayNames[i]}'),
                    trailing: current == i ? Icon(Icons.check_rounded, color: context.palette.accent) : null,
                    onTap: () => Navigator.pop(sheet, i),
                  ),
                ListTile(key: const ValueKey('rule-none'), minTileHeight: 52, title: const Text('Без повтора'), trailing: d.rule.isEmpty ? Icon(Icons.check_rounded, color: context.palette.accent) : null, onTap: () => Navigator.pop(sheet, -1)),
              ],
            ),
          ),
        ),
      ),
    );
    if (choice == null) return;
    _c.update(rule: choice < 0 ? const {} : weeklyRule(choice));
  }

  Future<void> _import() async {
    final list = _c.others.where((t) => t.id != _c.draft?.id).toList();
    if (list.isEmpty) {
      showMessage(context, 'Других шаблонов пока нет');
      return;
    }
    final id = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheet) => Container(
        decoration: BoxDecoration(color: context.palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
        child: SafeArea(
          child: Material(
            type: MaterialType.transparency,
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 8),
              children: [
                Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 4), child: Text('Подтянуть из шаблона', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: context.palette.ink))),
                Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text('Блоки, время и повтор будут заменены данными выбранного шаблона.', style: TextStyle(fontSize: 13, color: context.palette.inkMuted))),
                for (final t in list) ListTile(key: ValueKey('import-${t.id}'), minTileHeight: 56, title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text(ruleSummary(t.rule)), onTap: () => Navigator.pop(sheet, t.id)),
              ],
            ),
          ),
        ),
      ),
    );
    if (id == null) return;
    final ok = await _c.importFrom(id);
    if (!mounted) return;
    final d = _c.draft;
    if (ok && d != null) {
      _name.text = d.name;
      _description.text = d.description;
      showMessage(context, 'Данные шаблона подтянуты — не забудьте сохранить');
    } else {
      showMessage(context, _c.saveError ?? 'Не удалось подтянуть шаблон');
    }
  }

  Future<void> _delete() async {
    if (!await _confirm('Удалить шаблон?', 'Шаблон будет удалён. Уже созданные по нему программы останутся.', 'Удалить', danger: true)) return;
    final ok = await _c.remove();
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      showMessage(context, _c.saveError ?? 'Не удалось удалить шаблон');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final d = _c.draft;
        if (d != null) _fill(d);
        return PopScope(
          canPop: !_c.dirty,
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop) return;
            if (await _confirm('Выйти без сохранения?', 'Изменения в шаблоне пропадут.', 'Выйти', danger: true) && context.mounted) {
              Navigator.of(context).pop();
            }
          },
          child: ChurchPage(
            title: d == null ? 'Шаблон' : (d.isNew ? 'Новый шаблон' : d.name),
            subtitle: 'Редактор шаблона',
            actions: [
              if (d != null)
                PopupMenuButton<_TemplateAction>(
                  tooltip: 'Действия с шаблоном',
                  icon: const Icon(Icons.more_vert_rounded),
                  onSelected: (a) => a == _TemplateAction.import ? _import() : _delete(),
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: _TemplateAction.import, child: Text('Подтянуть из другого шаблона')),
                    if (!d.isNew) const PopupMenuItem(value: _TemplateAction.delete, child: Text('Удалить шаблон')),
                  ],
                ),
            ],
            body: AsyncBody(loading: _c.loading, error: _c.error, onRetry: _c.load, child: d == null ? const SizedBox.shrink() : _body(d)),
          ),
        );
      },
    );
  }

  Widget _body(TemplateDraft d) {
    final palette = context.palette;
    final plan = _dummyPlan(d);
    final timed = timedBlocks(plan);
    final membersById = {for (final m in _c.members) m.id: m};
    final typesById = {for (final t in _c.types) t.id: t};
    return Column(
      children: [
        Expanded(
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 0),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    LabeledField(key: const ValueKey('tpl-name'), label: 'Название шаблона', controller: _name, textCapitalization: TextCapitalization.sentences, onChanged: (v) => _c.update(name: v)),
                    const SizedBox(height: Space.md),
                    LabeledField(key: const ValueKey('tpl-description'), label: 'Описание', controller: _description, minLines: 2, maxLines: 4, textCapitalization: TextCapitalization.sentences, onChanged: (v) => _c.update(description: v)),
                    const SizedBox(height: Space.md),
                    ListGroup(
                      dividerIndent: 70,
                      children: [
                        ListRow(key: const ValueKey('tpl-time'), leading: const IconTile(Icons.schedule_rounded, tone: Tone.amber), title: 'Начало', subtitle: d.startTime, onTap: () => _pickTime(d)),
                        ListRow(key: const ValueKey('tpl-rule'), leading: const IconTile(Icons.repeat_rounded, tone: Tone.violet), title: 'Повтор', subtitle: ruleSummary(d.rule), subtitleMaxLines: 2, onTap: () => _pickRule(d)),
                        if (!d.isNew)
                          Material(
                            type: MaterialType.transparency,
                            child: SwitchListTile(
                              key: const ValueKey('tpl-active'),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                              secondary: const IconTile(Icons.power_settings_new_rounded, tone: Tone.green),
                              title: const Text('Шаблон включён'),
                              subtitle: const Text('Выключенный не предлагается при создании программы'),
                              value: d.active,
                              onChanged: (v) => _c.update(active: v),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: Space.lg),
                    Text('Блоки · ${d.blocks.where((b) => !b.isSeparator).length} · ${totalMinutes(d.blocks)} мин', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: palette.inkMuted, letterSpacing: 0.3)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(child: SecondaryButton(key: const ValueKey('tpl-add-block'), label: 'Добавить блок', icon: Icons.add_rounded, onPressed: _add)),
                        const SizedBox(width: 10),
                        Expanded(child: SecondaryButton(key: const ValueKey('tpl-add-separator'), label: 'Разделитель', icon: Icons.horizontal_rule_rounded, onPressed: () => _add(separator: true))),
                      ],
                    ),
                    const SizedBox(height: Space.md),
                  ]),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, 16),
                sliver: SliverReorderableList(
                  itemCount: timed.length,
                  onReorderItem: (from, to) => _c.reorder(from, to > from ? to + 1 : to),
                  proxyDecorator: (child, index, animation) => Material(color: Colors.transparent, elevation: 6, borderRadius: BorderRadius.circular(Radii.lg), child: child),
                  itemBuilder: (context, i) {
                    final slot = timed[i];
                    final b = slot.block;
                    return Padding(
                      key: ValueKey('tpl-block-${b.id}'),
                      padding: const EdgeInsets.only(bottom: 8),
                      child: BlockTile(
                        slot: slot,
                        index: i,
                        type: typesById[b.typeId],
                        responsible: membersById[b.assignedId]?.name,
                        onEdit: () => _editBlock(b),
                        onAction: (a) {
                          switch (a) {
                            case BlockAction.edit:
                              unawaited(_editBlock(b));
                            case BlockAction.toggleHidden:
                              break;
                            case BlockAction.delete:
                              _deleteBlock(b);
                          }
                        },
                        showVisibilityAction: false,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 8, Space.lg, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_c.saveError != null)
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: Semantics(liveRegion: true, child: InfoBanner(_c.saveError!, error: true))),
                PrimaryButton(key: const ValueKey('tpl-save'), label: d.isNew ? 'Создать шаблон' : 'Сохранить шаблон', icon: Icons.check_rounded, busy: _c.saving, onPressed: _c.saving ? null : _save),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
