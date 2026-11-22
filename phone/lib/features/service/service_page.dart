import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/cache_watch.dart';
import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../schedule/logic/schedule_labels.dart';
import 'data/plan_repository.dart';
import 'editor/data/editor_source.dart';
import 'editor/logic/editor_logic.dart';
import 'editor/plan_editor_page.dart';
import 'editor/templates_page.dart';
import 'editor/widgets/new_plan_sheet.dart';
import 'logic/plan_logic.dart';
import 'models/plan_models.dart';
import 'plan_page.dart';
import 'service_controller.dart';

enum _Tab { upcoming, past, archive }

/// Программы богослужений: предстоящие с ближайшей сверху и прошедшие.
class ServicePage extends StatefulWidget {
  const ServicePage({super.key, this.source, this.songTitles, this.editorSource});

  /// Для тестов; в приложении источник создаётся из сессии.
  final PlanSource? source;

  /// Для тестов: источник редактора (создание, архив).
  final PlanEditorSource? editorSource;

  /// Для тестов: названия песен вместо чтения копии песенника.
  final Future<Map<int, ({String title, String key})>> Function()? songTitles;

  @override
  State<ServicePage> createState() => _ServicePageState();
}

class _ServicePageState extends State<ServicePage> with CacheWatcher<ServicePage> {
  late final PlanSource _source;
  late final ServiceController _c;
  late final PlanEditorSource _editorSource;
  late final bool _canEdit;
  late final bool _canTemplates;
  _Tab _tab = _Tab.upcoming;
  List<PlanSummary>? _archived;
  String? _archiveError;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _source = widget.source ?? PlanRepository(session);
    _editorSource = widget.editorSource ?? PlanEditorApi(session);
    _canEdit = canManagePlan(session.user);
    _canTemplates = canManageTemplates(session.user);
    _c = ServiceController(_source)..load();
    watchCache(const ['/api/service-plans'], _c.load);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _open(PlanSummary plan) async {
    if (_canEdit) {
      await pushPage(context, PlanEditorPage(planId: plan.id, source: _editorSource, viewSource: _source, songTitles: widget.songTitles));
      if (!mounted) return;
      unawaited(_c.load());
      if (_tab == _Tab.archive) unawaited(_loadArchive());
      return;
    }
    await pushPage(context, PlanPage(summary: plan, source: _source, songTitles: widget.songTitles));
  }

  Future<void> _create() async {
    final id = await showNewPlanSheet(context, _editorSource);
    if (id == null || !mounted) return;
    await pushPage(context, PlanEditorPage(planId: id, source: _editorSource, viewSource: _source, songTitles: widget.songTitles));
    if (mounted) unawaited(_c.load());
  }

  Future<void> _loadArchive() async {
    setState(() => _archiveError = null);
    try {
      final list = await _editorSource.archived();
      if (mounted) setState(() => _archived = list);
    } catch (_) {
      if (mounted) setState(() => _archiveError = 'Не удалось загрузить архив. Проверьте интернет и попробуйте снова.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<SessionController>().user?.id ?? 0;
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        return ChurchPage(
          title: 'Служение',
          subtitle: 'Программы богослужений',
          actions: [
            if (_canTemplates) HeaderButton(icon: Icons.view_agenda_outlined, tooltip: 'Шаблоны', onPressed: () => pushPage(context, TemplatesPage(source: _editorSource))),
          ],
          floatingActionButton: _canEdit ? ChurchFab(circle: true, tooltip: 'Новая программа', onPressed: _create) : null,
          body: Column(
            children: [
              if (_c.hasPlans || _canEdit)
                Padding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 4),
                  child: SegmentedPills<_Tab>(
                    segments: [(_Tab.upcoming, 'Предстоящие · ${_c.upcoming.length}'), (_Tab.past, 'Прошедшие'), if (_canEdit) (_Tab.archive, 'Архив')],
                    selected: _tab,
                    onChanged: (t) {
                      setState(() => _tab = t);
                      if (t == _Tab.archive && _archived == null) unawaited(_loadArchive());
                    },
                  ),
                ),
              Expanded(child: _content(me)),
            ],
          ),
        );
      },
    );
  }

  Widget _archiveList(int me) {
    if (_archiveError != null) return ErrorView(message: _archiveError!, onRetry: _loadArchive);
    final list = _archived;
    if (list == null) return const LoadingView();
    if (list.isEmpty) return const EmptyHint('Архив пуст', icon: Icons.inventory_2_outlined, hint: 'Сюда попадают программы, отправленные в архив.');
    return SheetList(
      onRefresh: _loadArchive,
      children: [for (final p in list) _PlanCard(plan: p, today: _c.today, me: me, nearest: false, onTap: () => _open(p))],
    );
  }

  Widget _content(int me) {
    if (_c.loading && !_c.hasPlans) return const LoadingView();
    if (_c.error != null && !_c.hasPlans) return ErrorView(message: _c.error!, onRetry: _c.load);
    if (_tab == _Tab.archive) return _archiveList(me);
    if (!_c.hasPlans) {
      return EmptyHint('Программ служения пока нет', icon: Icons.event_note_outlined, hint: _canEdit ? 'Нажмите «+», чтобы создать программу по шаблону.' : 'Когда программу составят — она появится здесь.');
    }
    final plans = _tab == _Tab.upcoming ? _c.upcoming : _c.past;
    final stale = _c.staleSince;
    return SheetList(
      onRefresh: _c.load,
      gap: Space.md,
      children: [
        if (stale != null)
          InfoBanner('Нет связи — показаны программы, сохранённые ${relativeTime(stale.toIso8601String())}'),
        if (plans.isEmpty)
          EmptyHint(
            _tab == _Tab.upcoming ? 'Предстоящих программ нет' : 'Прошедших программ нет',
            icon: Icons.event_available_outlined,
            hint: _tab == _Tab.upcoming ? 'Новая программа появится здесь, когда её создадут.' : 'Показаны программы за последние три месяца.',
          )
        else
          for (var i = 0; i < plans.length; i++)
            _PlanCard(plan: plans[i], today: _c.today, me: me, nearest: _tab == _Tab.upcoming && i == 0, onTap: () => _open(plans[i])),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.today, required this.me, required this.nearest, required this.onTap});

  final PlanSummary plan;
  final DateTime today;
  final int me;
  final bool nearest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final facts = [
      if (plan.startTime.isNotEmpty) 'Начало ${plan.startTime}',
      if (plan.totalMinutes > 0) durationText(plan.totalMinutes),
      if (plan.blocksCount > 0) 'блоков: ${plan.blocksCount}',
    ].join(' · ');
    final isLeader = me > 0 && plan.leaderId == me;
    final isPreacher = me > 0 && plan.preacherId == me;
    return Semantics(
      button: true,
      label: '${friendlyDay(plan.date, today)}. ${plan.title}. $facts. ${plan.published ? 'Программа готова' : 'Программа в работе'}',
      excludeSemantics: true,
      child: ChurchCard(
        onTap: onTap,
        border: nearest ? Border.all(color: palette.accent.withValues(alpha: 0.4), width: 1.5) : null,
        child: Row(
          children: [
            DateBadge(date: plan.date),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(friendlyDay(plan.date, today), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                  const SizedBox(height: 2),
                  Text(plan.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink)),
                  if (facts.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(facts, style: ChurchType.caption.copyWith(color: palette.inkMuted))),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      if (nearest) const StatusPill('Ближайшая', solid: true),
                      StatusPill(plan.published ? 'Программа готова' : 'В работе', tone: plan.published ? Tone.green : Tone.neutral),
                      if (isLeader) const StatusPill('Вы — ведущий', tone: Tone.wine, solid: true),
                      if (isPreacher) const StatusPill('Вы — проповедник', tone: Tone.wine, solid: true),
                    ],
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: palette.chevron),
          ],
        ),
      ),
    );
  }
}
