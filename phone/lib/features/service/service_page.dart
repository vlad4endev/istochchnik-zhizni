import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../schedule/logic/schedule_labels.dart';
import 'data/plan_repository.dart';
import 'logic/plan_logic.dart';
import 'models/plan_models.dart';
import 'plan_page.dart';
import 'service_controller.dart';

enum _Tab { upcoming, past }

/// Программы богослужений: предстоящие с ближайшей сверху и прошедшие.
class ServicePage extends StatefulWidget {
  const ServicePage({super.key, this.source});

  /// Для тестов; в приложении источник создаётся из сессии.
  final PlanSource? source;

  @override
  State<ServicePage> createState() => _ServicePageState();
}

class _ServicePageState extends State<ServicePage> {
  late final PlanSource _source;
  late final ServiceController _c;
  _Tab _tab = _Tab.upcoming;

  @override
  void initState() {
    super.initState();
    _source = widget.source ?? PlanRepository(context.read<SessionController>());
    _c = ServiceController(_source)..load();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _open(PlanSummary plan) => pushPage(context, PlanPage(summary: plan, source: _source));

  @override
  Widget build(BuildContext context) {
    final me = context.read<SessionController>().user?.id ?? 0;
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        return ChurchPage(
          title: 'Служение',
          subtitle: 'Программы богослужений',
          body: Column(
            children: [
              if (_c.hasPlans)
                Padding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 4),
                  child: SegmentedPills<_Tab>(
                    segments: [(_Tab.upcoming, 'Предстоящие · ${_c.upcoming.length}'), (_Tab.past, 'Прошедшие')],
                    selected: _tab,
                    onChanged: (t) => setState(() => _tab = t),
                  ),
                ),
              Expanded(child: _content(me)),
            ],
          ),
        );
      },
    );
  }

  Widget _content(int me) {
    if (_c.loading && !_c.hasPlans) return const LoadingView();
    if (_c.error != null && !_c.hasPlans) return ErrorView(message: _c.error!, onRetry: _c.load);
    if (!_c.hasPlans) {
      return const EmptyHint('Программ служения пока нет', icon: Icons.event_note_outlined, hint: 'Программы составляют на сайте в разделе «Служение». Когда появится — она будет здесь.');
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
