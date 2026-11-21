import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../../../core/session.dart';
import '../data/plan_repository.dart' show PlanSource;
import '../models/plan_models.dart' show PlanSummary;
import '../plan_page.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../../schedule/models/schedule_models.dart' show PersonRef;
import '../../schedule/widgets/person_picker.dart';
import 'data/editor_source.dart';
import 'logic/editor_logic.dart';
import 'models/editor_models.dart';
import 'plan_editor_controller.dart';
import 'widgets/block_editor_sheet.dart';
import 'widgets/block_tile.dart';

enum _PlanAction { preview, copyLink, copyProgram, archive, delete }

/// Редактор программы служения: настройки, блоки, перетаскивание, ответственные, публикация.
class PlanEditorPage extends StatefulWidget {
  const PlanEditorPage({super.key, required this.planId, this.source, this.viewSource, this.songTitles});

  final int planId;

  /// Для тестов; в приложении источник создаётся из сессии.
  final PlanEditorSource? source;

  /// Источник для просмотра «как участник»; без него пункт меню скрыт.
  final PlanSource? viewSource;
  final Future<Map<int, ({String title, String key})>> Function()? songTitles;

  @override
  State<PlanEditorPage> createState() => _PlanEditorPageState();
}

class _PlanEditorPageState extends State<PlanEditorPage> {
  late final PlanEditorController _c;
  bool _settingsOpen = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _c = PlanEditorController(widget.source ?? PlanEditorApi(session), widget.planId, canManage: canManagePlan(session.user))..load();
  }

  @override
  void dispose() {
    // Несохранённые правки дописываем до закрытия контроллера.
    if (_c.hasUnsaved) {
      unawaited(_c.flush().whenComplete(_c.dispose));
    } else {
      _c.dispose();
    }
    super.dispose();
  }

  String _origin() => context.read<SessionController>().apiOrigin;

  Future<void> _editBlock(EditorBlock block) async {
    final plan = _c.draft;
    if (plan == null) return;
    final edited = await showBlockEditor(
      context,
      block: block,
      types: _c.lookups.types,
      members: _c.lookups.members,
      plan: plan,
      loadSongs: () async {
        await _c.loadSongs();
        return _c.songs;
      },
    );
    if (edited == null) return;
    _c.updateBlock(block.id, (_) => edited);
  }

  Future<void> _add({bool separator = false}) async {
    final id = separator ? await _c.addSeparator() : await _c.addBlock();
    if (!mounted) return;
    if (id == null) {
      showMessage(context, _c.saveError ?? 'Не удалось добавить блок');
      return;
    }
    final block = _c.draft?.blocks.where((b) => b.id == id).firstOrNull;
    if (block != null) await _editBlock(block);
  }

  Future<void> _delete(EditorBlock block) async {
    final snapshot = await _c.deleteBlock(block.id);
    if (!mounted) return;
    if (snapshot == null) {
      showMessage(context, _c.saveError ?? 'Не удалось удалить блок');
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(block.isSeparator ? 'Раздел удалён' : 'Блок «${block.title}» удалён'),
        action: SnackBarAction(label: 'Отменить', onPressed: () => unawaited(_c.restoreBlock(snapshot))),
      ));
  }

  Future<void> _togglePublish() async {
    final plan = _c.draft;
    if (plan == null) return;
    bool? notify;
    if (!plan.published && plan.notifySentAt != null) {
      final choice = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Отправить уведомление снова?'),
          content: const Text('О готовности программы уже сообщали. Отправить ещё раз в Telegram и чаты приложения или опубликовать без рассылки?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
            TextButton(onPressed: () => Navigator.pop(context, 'no'), child: const Text('Без рассылки')),
            FilledButton(onPressed: () => Navigator.pop(context, 'yes'), child: const Text('Отправить')),
          ],
        ),
      );
      if (choice == null) return;
      notify = choice == 'yes';
    }
    final result = await _c.togglePublish(sendNotify: notify);
    if (!mounted) return;
    if (result == null) {
      showMessage(context, _c.saveError ?? 'Не удалось изменить статус');
      return;
    }
    if (_c.draft?.published == true) {
      final sl = result.setlistSongs;
      showMessage(
        context,
        sl != null ? (result.setlistCreated == true ? 'Опубликовано. Сетлист создан ($sl песен) — он в Студии.' : 'Опубликовано. Сетлист обновлён ($sl песен).') : 'Программа опубликована',
      );
    } else {
      showMessage(context, 'Программа возвращена в черновик');
    }
  }

  Future<bool> _confirm(String title, String text, String action, {bool danger = false}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          FilledButton(
            style: danger ? FilledButton.styleFrom(backgroundColor: ChurchColors.danger) : null,
            onPressed: () => Navigator.pop(context, true),
            child: Text(action),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _onAction(_PlanAction action) async {
    final plan = _c.draft;
    if (plan == null) return;
    switch (action) {
      case _PlanAction.preview:
        await _c.flush();
        if (!mounted) return;
        await pushPage(
          context,
          PlanPage(
            summary: PlanSummary(id: plan.id, date: plan.date, startTime: plan.startTime, published: plan.published, blocksCount: plan.blocks.length, templateName: plan.templateName, totalMinutes: _c.total, leaderId: plan.leaderId, preacherId: plan.preacherId, shareToken: plan.shareToken),
            source: widget.viewSource!,
            songTitles: widget.songTitles,
          ),
        );
      case _PlanAction.copyLink:
        if (plan.shareToken.isEmpty) {
          showMessage(context, 'У программы пока нет ссылки');
          return;
        }
        await Clipboard.setData(ClipboardData(text: resolveUrl(_origin(), '/service-plan/share/${plan.shareToken}')));
        if (mounted) showMessage(context, 'Ссылка на программу скопирована');
      case _PlanAction.copyProgram:
        await Clipboard.setData(ClipboardData(text: programText(plan, _c.timed, _c.lookups, _c.typeOf)));
        if (mounted) showMessage(context, 'Программа скопирована — вставьте её в чат');
      case _PlanAction.archive:
        final to = !plan.archived;
        if (!await _confirm(to ? 'В архив?' : 'Вернуть из архива?', to ? 'Программа уйдёт в архив.' : 'Программа снова станет активной.', to ? 'В архив' : 'Вернуть')) return;
        final ok = await _c.setArchived(to);
        if (!mounted) return;
        if (ok && to) {
          Navigator.of(context).pop(true);
        } else if (!ok) {
          showMessage(context, _c.saveError ?? 'Не удалось выполнить');
        }
      case _PlanAction.delete:
        if (!await _confirm('Удалить программу?', 'Программа будет удалена безвозвратно. Это действие нельзя отменить.', 'Удалить', danger: true)) return;
        final ok = await _c.deletePlan();
        if (!mounted) return;
        if (ok) {
          Navigator.of(context).pop(true);
        } else {
          showMessage(context, _c.saveError ?? 'Не удалось удалить');
        }
    }
  }

  // ───── настройки ─────

  Future<void> _pickDate(PlanDraft plan) async {
    final picked = await showDatePicker(context: context, initialDate: plan.date, firstDate: DateTime(2020), lastDate: DateTime(2100), locale: const Locale('ru'));
    if (picked != null) _c.updateSettings(date: DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickTime(PlanDraft plan) async {
    final parts = plan.startTime.split(':');
    final initial = TimeOfDay(hour: int.tryParse(parts.first) ?? 10, minute: parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0);
    final picked = await showTimePicker(context: context, initialTime: initial, builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true), child: child!));
    if (picked != null) {
      _c.updateSettings(startTime: '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}');
    }
  }

  Future<void> _pickPerson({
    required String title,
    required String subtitle,
    required bool Function(Member) filter,
    required int? currentId,
    required String clearLabel,
    required void Function(int? id) apply,
  }) async {
    PersonRef ref(Member m) => PersonRef(id: m.id, name: m.name, ministryRole: m.ministryRole, ministryDirection: m.ministryDirection);
    final all = _c.lookups.members;
    final current = _c.member(currentId);
    await showPersonPicker(
      context,
      title: title,
      subtitle: subtitle,
      load: (everyone) async => [for (final m in all) if (everyone || filter(m)) ref(m)],
      current: current == null ? null : ref(current),
      clearLabel: clearLabel,
      onClear: () async => apply(null),
      onPick: (p) async => apply(p.id),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final plan = _c.draft;
        return ChurchPage(
          title: plan == null ? 'Программа' : _title(plan),
          subtitle: plan == null ? null : (plan.templateName.isEmpty ? 'Редактор программы' : plan.templateName),
          actions: [
            if (plan != null)
              PopupMenuButton<_PlanAction>(
                tooltip: 'Действия с программой',
                icon: const Icon(Icons.more_vert_rounded),
                onSelected: _onAction,
                itemBuilder: (_) => [
                  if (widget.viewSource != null) const PopupMenuItem(value: _PlanAction.preview, child: Text('Посмотреть как участник')),
                  const PopupMenuItem(value: _PlanAction.copyLink, child: Text('Скопировать ссылку')),
                  const PopupMenuItem(value: _PlanAction.copyProgram, child: Text('Скопировать программу')),
                  if (_c.canManage) PopupMenuItem(value: _PlanAction.archive, child: Text(plan.archived ? 'Вернуть из архива' : 'В архив')),
                  if (_c.canManage) const PopupMenuItem(value: _PlanAction.delete, child: Text('Удалить программу')),
                ],
              ),
          ],
          body: AsyncBody(loading: _c.loading, error: _c.error, onRetry: _c.load, child: plan == null ? const SizedBox.shrink() : _body(plan)),
        );
      },
    );
  }

  String _title(PlanDraft plan) => '${weekdayName(plan.date)[0].toUpperCase()}${weekdayName(plan.date).substring(1)}, ${dayMonth(plan.date)}';

  Widget _body(PlanDraft plan) {
    final timed = _c.timed;
    return RefreshIndicator(
      onRefresh: _c.load,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 0),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _Summary(plan: plan, c: _c),
                const SizedBox(height: Space.md),
                if (_c.canManage) ...[_settings(plan), const SizedBox(height: Space.md)],
                _Actions(c: _c, plan: plan, onAdd: () => _add(), onSeparator: () => _add(separator: true), onPublish: _togglePublish),
                const SizedBox(height: Space.md),
                if (timed.isEmpty) const EmptyHint('В программе пока нет блоков', icon: Icons.view_agenda_outlined, hint: 'Добавьте первый блок кнопкой выше'),
              ]),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, 96),
            sliver: SliverReorderableList(
              itemCount: timed.length,
              // onReorderItem уже учитывает удаление элемента, а контроллер ждёт «сырой» индекс.
              onReorderItem: (from, to) => unawaited(_c.reorder(from, to > from ? to + 1 : to)),
              proxyDecorator: (child, index, animation) => Material(color: Colors.transparent, elevation: 6, borderRadius: BorderRadius.circular(Radii.lg), child: child),
              itemBuilder: (context, i) {
                final slot = timed[i];
                final b = slot.block;
                return Padding(
                  key: ValueKey('block-${b.id}'),
                  padding: const EdgeInsets.only(bottom: 8),
                  child: BlockTile(
                    slot: slot,
                    index: i,
                    type: _c.typeOf(b),
                    responsible: _c.member(b.assignedId)?.name,
                    onEdit: () => _editBlock(b),
                    onAction: (a) {
                      switch (a) {
                        case BlockAction.edit:
                          unawaited(_editBlock(b));
                        case BlockAction.toggleHidden:
                          _c.updateBlock(b.id, (x) {
                            final content = {...x.content};
                            if (x.isHidden) {
                              content.remove('hide_in_public');
                            } else {
                              content['hide_in_public'] = true;
                            }
                            return x.copyWith(content: content);
                          });
                        case BlockAction.delete:
                          unawaited(_delete(b));
                      }
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _settings(PlanDraft plan) {
    String name(int? id) => _c.member(id)?.name ?? '';
    final summary = [
      '${weekdayName(plan.date)}, ${dayMonth(plan.date)} · ${plan.startTime}',
      if (name(plan.leaderId).isNotEmpty) 'ведёт ${name(plan.leaderId)}',
      if (name(plan.preacherId).isNotEmpty) 'проповедь ${name(plan.preacherId)}',
    ].join(' · ');
    return ListGroup(
      dividerIndent: 70,
      children: [
        ListRow(
          key: const ValueKey('settings-toggle'),
          leading: const IconTile(Icons.tune_rounded, tone: Tone.wine),
          title: 'Настройки программы',
          subtitle: _settingsOpen ? 'Дата, время и ответственные' : summary,
          subtitleMaxLines: 2,
          chevron: false,
          trailing: Icon(_settingsOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded),
          onTap: () => setState(() => _settingsOpen = !_settingsOpen),
        ),
        if (_settingsOpen) ...[
        ListRow(key: const ValueKey('set-date'), leading: const IconTile(Icons.event_outlined, tone: Tone.violet), title: 'Дата служения', subtitle: longDate(plan.date), onTap: () => _pickDate(plan)),
        ListRow(key: const ValueKey('set-time'), leading: const IconTile(Icons.schedule_rounded, tone: Tone.amber), title: 'Начало', subtitle: plan.startTime, onTap: () => _pickTime(plan)),
        ListRow(
          key: const ValueKey('set-leader'),
          leading: const IconTile(Icons.record_voice_over_outlined, tone: Tone.teal),
          title: 'Ведущий',
          subtitle: name(plan.leaderId).isEmpty ? 'Не назначен' : name(plan.leaderId),
          onTap: () => _pickPerson(title: 'Ведущий', subtitle: 'Кто ведёт собрание', filter: isLeaderCandidate, currentId: plan.leaderId, clearLabel: 'Снять', apply: (id) => _c.updateSettings(leaderId: id)),
        ),
        ListRow(
          key: const ValueKey('set-preacher'),
          leading: const IconTile(Icons.mic_none_rounded, tone: Tone.rose),
          title: 'Проповедник',
          subtitle: name(plan.preacherId).isEmpty ? 'Не назначен' : name(plan.preacherId),
          onTap: () => _pickPerson(title: 'Проповедник', subtitle: 'Кто проповедует', filter: isPreacherCandidate, currentId: plan.preacherId, clearLabel: 'Снять', apply: (id) => _c.updateSettings(preacherId: id)),
        ),
        ListRow(
          key: const ValueKey('set-music'),
          leading: const IconTile(Icons.music_note_rounded, tone: Tone.green),
          title: 'Ответственный за музыку',
          subtitle: name(plan.musicId).isEmpty ? 'Не назначен' : name(plan.musicId),
          onTap: () => _pickPerson(title: 'Музыка', subtitle: 'Ответственный за песни', filter: isMusicCandidate, currentId: plan.musicId, clearLabel: 'Снять', apply: (id) => _c.updateSettings(musicId: id)),
        ),
        ListRow(
          key: const ValueKey('set-poem'),
          leading: const IconTile(Icons.edit_note_rounded, tone: Tone.wine),
          title: 'Ответственный за стихи',
          subtitle: name(plan.poemId).isEmpty ? 'Не назначен' : name(plan.poemId),
          onTap: () => _pickPerson(title: 'Стихи', subtitle: 'Кто заполняет блоки «Стих»', filter: (_) => true, currentId: plan.poemId, clearLabel: 'Снять', apply: (id) => _c.updateSettings(poemId: id)),
        ),
        ],
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.plan, required this.c});

  final PlanDraft plan;
  final PlanEditorController c;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final count = plan.blocks.where((b) => !b.isSeparator).length;
    final status = switch (c.saveStatus) {
      SaveStatus.saving => 'Сохраняем…',
      SaveStatus.saved => 'Сохранено',
      SaveStatus.error => c.saveError ?? 'Не удалось сохранить',
      SaveStatus.idle => '',
    };
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusPill(plan.published ? 'Опубликована' : 'Черновик', tone: plan.published ? Tone.green : Tone.neutral, solid: plan.published),
              if (plan.archived) const StatusPill('Архив', tone: Tone.neutral),
              Text('$count блоков · ${c.total} мин · ${plan.startTime}–${endTime(plan)}', style: TextStyle(fontSize: 13.5, color: palette.inkMuted)),
            ],
          ),
          if (status.isNotEmpty || plan.lastEditedBy.isNotEmpty) const SizedBox(height: 8),
          if (status.isNotEmpty)
            Semantics(
              liveRegion: true,
              child: Row(
                children: [
                  Icon(c.saveStatus == SaveStatus.error ? Icons.error_outline_rounded : (c.saveStatus == SaveStatus.saving ? Icons.sync_rounded : Icons.check_circle_outline_rounded), size: 16, color: c.saveStatus == SaveStatus.error ? ChurchColors.danger : palette.inkMuted),
                  const SizedBox(width: 6),
                  Expanded(child: Text(status, style: TextStyle(fontSize: 13, color: c.saveStatus == SaveStatus.error ? ChurchColors.danger : palette.inkMuted))),
                  if (c.saveStatus == SaveStatus.error) TextButton(onPressed: c.flush, child: const Text('Повторить')),
                ],
              ),
            ),
          if (plan.lastEditedBy.isNotEmpty) Text('Последнее изменение: ${plan.lastEditedBy}', style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
        ],
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.c, required this.plan, required this.onAdd, required this.onSeparator, required this.onPublish});

  final PlanEditorController c;
  final PlanDraft plan;
  final VoidCallback onAdd;
  final VoidCallback onSeparator;
  final VoidCallback onPublish;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: SecondaryButton(key: const ValueKey('add-block'), label: 'Добавить блок', icon: Icons.add_rounded, onPressed: c.busy ? null : onAdd)),
            const SizedBox(width: 10),
            Expanded(child: SecondaryButton(key: const ValueKey('add-separator'), label: 'Разделитель', icon: Icons.horizontal_rule_rounded, onPressed: c.busy ? null : onSeparator)),
          ],
        ),
        const SizedBox(height: 10),
        PrimaryButton(
          key: const ValueKey('publish'),
          label: plan.published ? 'Вернуть в черновик' : 'Опубликовать',
          icon: plan.published ? Icons.unpublished_outlined : Icons.cloud_upload_outlined,
          busy: c.busy,
          onPressed: c.busy ? null : onPublish,
        ),
      ],
    );
  }
}

/// Текст программы для отправки в чат: время, название, ответственный.
String programText(PlanDraft plan, List<PlanSlot> timed, EditorLookups lookups, BlockType? Function(EditorBlock) typeOf) {
  final members = lookups.membersById;
  final lines = <String>['${weekdayName(plan.date)}, ${dayMonth(plan.date)} · ${plan.startTime}'];
  for (final s in timed) {
    final b = s.block;
    if (b.isHidden) continue;
    if (b.isSeparator) {
      lines.add('— ${b.separatorLabel} —');
      continue;
    }
    final who = members[b.assignedId]?.name;
    lines.add('${s.startsAt} ${b.title}${who == null || b.title.contains(who) ? '' : ' — $who'}');
  }
  lines.add('Конец ${endTime(plan)}');
  return lines.join('\n');
}
