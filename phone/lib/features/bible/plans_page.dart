import 'package:material_ui/material_ui.dart';

import '../../core/church_api.dart';
import '../../core/plural.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'data/bible_repository.dart';
import 'models/plan_models.dart';

/// Быстрые цели для нового плана: человек не обязан придумывать формулировку.
const planGoals = <String>[
  'Евангелия за 30 дней',
  'Новый Завет за 90 дней',
  'Псалмы и Притчи за 30 дней',
  'Вся Библия за год',
];

const planDaysChoices = <int>[7, 14, 30, 60, 90];

String _daysText(int n) => '$n ${pluralRu(n, 'день', 'дня', 'дней')}';

/// Планы чтения: список с прогрессом и создание нового плана.
class BiblePlansPage extends StatefulWidget {
  const BiblePlansPage({super.key, required this.source, required this.onOpenRef});

  final BibleSource source;
  final void Function(PlanRef ref) onOpenRef;

  @override
  State<BiblePlansPage> createState() => _BiblePlansPageState();
}

class _BiblePlansPageState extends State<BiblePlansPage> {
  bool _loading = true;
  String? _error;
  List<BiblePlan> _plans = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final list = await widget.source.plans();
      if (!mounted) return;
      setState(() {
        _plans = list;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _open(int id) async {
    await pushPage(context, BiblePlanPage(source: widget.source, planId: id, onOpenRef: widget.onOpenRef));
    if (mounted) await _load(quiet: true);
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<BiblePlan>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _NewPlanSheet(source: widget.source),
    );
    if (created == null || !mounted) return;
    await _load(quiet: true);
    if (mounted) await _open(created.id);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchPage(
      title: 'Планы чтения',
      subtitle: 'Библия по дням',
      floatingActionButton: ChurchFab(tooltip: 'Новый план', onPressed: _create),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _plans.isEmpty
            ? EmptyHint(
                'Планов пока нет',
                icon: Icons.event_note_rounded,
                hint: 'Выберите цель — например, «Евангелия за 30 дней» — и приложение разложит чтение по дням.',
                action: PrimaryButton(label: 'Составить план', icon: Icons.add_rounded, expand: false, height: 48, onPressed: _create),
              )
            : SheetList(
                onRefresh: _load,
                children: [
                  for (final plan in _plans)
                    ChurchCard(
                      onTap: () => _open(plan.id),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(plan.title, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, color: palette.ink)),
                          if (plan.goal.isNotEmpty && plan.goal != plan.title) Padding(padding: const EdgeInsets.only(top: 2), child: Text(plan.goal, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: palette.inkMuted))),
                          const SizedBox(height: 12),
                          _ProgressBar(plan: plan),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.plan});

  final BiblePlan plan;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          label: 'Прочитано дней: ${plan.daysCompleted} из ${plan.daysTotal}',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: plan.progress, minHeight: 8, color: palette.accent, backgroundColor: palette.accentSoft),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          plan.finished ? 'План прочитан целиком' : '${plan.daysCompleted} из ${plan.daysTotal} ${pluralRu(plan.daysTotal, 'дня', 'дней', 'дней')}',
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: palette.inkMuted),
        ),
      ],
    );
  }
}

class _NewPlanSheet extends StatefulWidget {
  const _NewPlanSheet({required this.source});

  final BibleSource source;

  @override
  State<_NewPlanSheet> createState() => _NewPlanSheetState();
}

class _NewPlanSheetState extends State<_NewPlanSheet> {
  final _goal = TextEditingController(text: planGoals.first);
  int _days = 30;
  bool _busy = false;
  String? _problem;

  @override
  void dispose() {
    _goal.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final goal = _goal.text.trim();
    if (goal.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final plan = await widget.source.generatePlan(goal: goal, days: _days);
      if (mounted) Navigator.pop(context, plan);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _problem = 'Не удалось составить план: ${describeDio(error)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
      decoration: BoxDecoration(color: palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text('Новый план чтения', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: palette.ink))),
            const SizedBox(height: 14),
            LabeledField(label: 'Цель', controller: _goal, hint: 'Например, Евангелия за 30 дней', maxLines: 2, minLines: 1, textCapitalization: TextCapitalization.sentences),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final g in planGoals)
                  ActionChip(
                    label: Text(g),
                    onPressed: _busy ? null : () => setState(() => _goal.text = g),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text('Сколько дней', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final d in planDaysChoices)
                  ChoiceChip(
                    label: Text('$d'),
                    selected: _days == d,
                    onSelected: _busy ? null : (_) => setState(() => _days = d),
                  ),
              ],
            ),
            if (_problem != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_problem!, key: const ValueKey('plan-problem'), style: const TextStyle(color: ChurchColors.danger, fontWeight: FontWeight.w600))),
            const SizedBox(height: 18),
            PrimaryButton(key: const ValueKey('plan-create'), label: _busy ? 'Составляем план…' : 'Составить план', icon: Icons.auto_awesome_rounded, busy: _busy, onPressed: _goal.text.trim().isEmpty ? null : _submit),
          ],
        ),
      ),
    );
  }
}

/// Один план: что читать сегодня и все дни с отметками.
class BiblePlanPage extends StatefulWidget {
  const BiblePlanPage({super.key, required this.source, required this.planId, required this.onOpenRef});

  final BibleSource source;
  final int planId;
  final void Function(PlanRef ref) onOpenRef;

  @override
  State<BiblePlanPage> createState() => _BiblePlanPageState();
}

class _BiblePlanPageState extends State<BiblePlanPage> {
  bool _loading = true;
  String? _error;
  BiblePlan? _plan;
  final _pending = <int>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final plan = await widget.source.plan(widget.planId);
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  /// Отметка сразу видна; если сервер не принял — возвращаем как было и говорим об этом.
  Future<void> _toggle(BiblePlanDay day) async {
    final plan = _plan;
    if (plan == null || !_pending.add(day.dayIndex)) return;
    final done = !day.done;
    setState(() => _plan = plan.withDays([for (final d in plan.days) d.dayIndex == day.dayIndex ? d.copyWith(done: done) : d]));
    try {
      await widget.source.setPlanDay(plan.id, day.dayIndex, done: done);
    } catch (_) {
      if (mounted) {
        setState(() => _plan = _plan?.withDays([for (final d in _plan!.days) d.dayIndex == day.dayIndex ? d.copyWith(done: !done) : d]));
        showMessage(context, 'Не удалось сохранить отметку — проверьте интернет.');
      }
    } finally {
      _pending.remove(day.dayIndex);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить план?'),
        content: const Text('Отметки о прочитанном тоже пропадут.'),
        actions: [
          TextButton(key: const ValueKey('plan-keep'), onPressed: () => Navigator.pop(context, false), child: const Text('Оставить')),
          TextButton(key: const ValueKey('plan-delete'), onPressed: () => Navigator.pop(context, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await widget.source.deletePlan(widget.planId);
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось удалить план — проверьте интернет.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final plan = _plan;
    final palette = context.palette;
    return ChurchPage(
      title: plan?.title ?? 'План чтения',
      subtitle: plan == null ? null : (plan.goal.isEmpty ? _daysText(plan.daysTotal) : plan.goal),
      actions: [
        if (plan != null) HeaderButton(icon: Icons.delete_outline_rounded, tooltip: 'Удалить план', onPressed: _delete),
      ],
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: plan == null
            ? const SizedBox.shrink()
            : SheetList(
                onRefresh: _load,
                children: [
                  ChurchCard(child: _ProgressBar(plan: plan)),
                  if (plan.nextDay case final next?)
                    ChurchCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('ЧИТАТЬ СЕЙЧАС', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: palette.accent)),
                          const SizedBox(height: 6),
                          Text(next.title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink)),
                          const SizedBox(height: 10),
                          _RefChips(refs: next.refs, onOpen: widget.onOpenRef),
                          const SizedBox(height: 12),
                          PrimaryButton(key: const ValueKey('plan-mark-next'), label: 'Прочитано', icon: Icons.check_rounded, height: 48, onPressed: () => _toggle(next)),
                        ],
                      ),
                    )
                  else if (plan.finished)
                    const InfoBanner('План прочитан целиком — слава Богу!'),
                  ListGroup(
                    dividerIndent: 14,
                    children: [
                      for (final day in plan.days)
                        Padding(
                          key: ValueKey('plan-day-${day.dayIndex}'),
                          padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(day.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: day.done ? palette.inkMuted : palette.ink, decoration: day.done ? TextDecoration.lineThrough : null)),
                                    const SizedBox(height: 6),
                                    _RefChips(refs: day.refs, onOpen: widget.onOpenRef),
                                  ],
                                ),
                              ),
                              Semantics(
                                label: day.done ? 'Снять отметку: ${day.title}' : 'Отметить прочитанным: ${day.title}',
                                checked: day.done,
                                child: IconButton(
                                  key: ValueKey('plan-check-${day.dayIndex}'),
                                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                                  onPressed: () => _toggle(day),
                                  icon: Icon(day.done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: day.done ? ChurchColors.successBright : palette.chevron, size: 26),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

class _RefChips extends StatelessWidget {
  const _RefChips({required this.refs, required this.onOpen});

  final List<PlanRef> refs;
  final void Function(PlanRef ref) onOpen;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (refs.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final ref in refs)
          Semantics(
            button: true,
            label: 'Открыть ${ref.label}',
            excludeSemantics: true,
            child: Material(
              color: palette.accentSoft,
              borderRadius: BorderRadius.circular(20),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onOpen(ref),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 40),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  alignment: Alignment.center,
                  child: Text(ref.label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: palette.accent)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
