import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/plural.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'data/prayer_source.dart';
import 'logic/prayer_logic.dart';
import 'models/prayer_models.dart';
import 'prayer_controllers.dart';
import 'widgets/day_sheet.dart';
import 'widgets/sheet_frame.dart';

/// «Сбор нужд · очередь недели»: для координаторов, пастора и администратора.
class CollectionPage extends StatefulWidget {
  const CollectionPage({super.key, this.source, this.initialKind = WeekKind.current});

  /// Для тестов; в приложении берётся из сессии.
  final PrayerSource? source;
  final WeekKind initialKind;

  @override
  State<CollectionPage> createState() => _CollectionPageState();
}

class _CollectionPageState extends State<CollectionPage> {
  late final CollectionController _c;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _c = CollectionController(widget.source ?? PrayerApi(session), meId: session.user?.id ?? 0)
      ..kind = widget.initialKind;
    _c.load();
  }

  @override
  void dispose() {
    _search.dispose();
    _c.dispose();
    super.dispose();
  }

  Future<void> _distribute() async {
    final label = _c.kind == WeekKind.current ? 'эту' : 'следующую';
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Автораспределить кураторов?'),
        content: Text(
          'Кураторов на $label неделю назначат по правилам нагрузки, '
          'а им придёт уведомление. Прежние назначения могут измениться.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Распределить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final r = await _c.autoDistribute();
      if (!mounted) return;
      showMessage(
        context,
        'Готово: ${r.total} ${pluralRu(r.total, 'назначение', 'назначения', 'назначений')}, '
        'уведомлены ${r.notified} ${pluralRu(r.notified, 'куратор', 'куратора', 'кураторов')}.',
      );
    } catch (error) {
      if (mounted) showMessage(context, 'Не удалось распределить: ${actionError(error)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) => ChurchPage(
        title: 'Сбор нужд',
        subtitle: 'Очередь молитвенного цикла по дням',
        actions: [
          HeaderButton(
            icon: Icons.shuffle_rounded,
            tooltip: 'Автораспределить кураторов',
            onPressed: _c.distributing || _c.loading ? null : _distribute,
          ),
        ],
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 0),
              child: SegmentedPills<WeekKind>(
                segments: [for (final k in WeekKind.values) (k, k.label)],
                selected: _c.kind,
                onChanged: (k) {
                  _search.clear();
                  _c.setKind(k);
                },
              ),
            ),
            Expanded(
              child: AsyncBody(
                loading: _c.loading,
                error: _c.error,
                onRetry: () => _c.load(force: true),
                child: _content(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final stats = _c.stats;
    final rows = _c.visible;
    final palette = context.palette;
    return SheetList(
      onRefresh: () => _c.load(force: true),
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 32),
      children: [
        _Summary(stats: stats, showCurators: !_c.claimsFailed),
        if (_c.claimsFailed)
          const InfoBanner('Отметки сбора сейчас недоступны — потяните вниз, чтобы обновить.', error: true),
        ChurchSearchField(controller: _search, hint: 'Имя участника', onChanged: _c.setQuery),
        FilterChips<CollectionFilter>(
          selected: _c.filter,
          onChanged: _c.setFilter,
          items: [
            (CollectionFilter.all, CollectionFilter.all.label, stats.days),
            (CollectionFilter.needEmpty, CollectionFilter.needEmpty.label, stats.empty),
            (CollectionFilter.needFilled, CollectionFilter.needFilled.label, stats.filled),
            if (!_c.claimsFailed) ...[
              (CollectionFilter.curatorFree, CollectionFilter.curatorFree.label, stats.free),
              (CollectionFilter.curatorMine, CollectionFilter.curatorMine.label, stats.mine),
              (CollectionFilter.curatorBusy, CollectionFilter.curatorBusy.label, stats.busy),
            ],
          ],
        ),
        if (_c.days.isEmpty)
          const EmptyHint('На эту неделю данных нет', icon: Icons.event_busy_outlined)
        else if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Ничего не найдено — смените фильтр или поиск.',
              textAlign: TextAlign.center,
              style: TextStyle(color: palette.inkMuted),
            ),
          )
        else
          for (final day in rows)
            _DayCard(
              day: day,
              claim: day.member == null ? null : _c.claims.of(day.member!.id),
              meId: _c.meId,
              showCurator: !_c.claimsFailed,
              onTap: day.member == null ? null : () => showDaySheet(context, _c, day.ymd),
            ),
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.stats, required this.showCurators});

  final CollectionStats stats;
  final bool showCurators;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final total = stats.filled + stats.empty;
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Заполнение нужд',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted),
                ),
              ),
              Text(
                '${stats.filled} из $total',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: palette.ink),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Semantics(
            label: 'Заполнено ${stats.filled} из $total',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: stats.progress,
                minHeight: 8,
                color: ChurchColors.wine,
                backgroundColor: palette.outline,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            [
              '${stats.days} ${pluralRu(stats.days, 'день', 'дня', 'дней')}',
              'без текста ${stats.empty}',
              if (showCurators) 'без куратора ${stats.free}',
            ].join(' · '),
            style: TextStyle(fontSize: 12.5, color: palette.inkMuted),
          ),
        ],
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    required this.day,
    required this.claim,
    required this.meId,
    required this.showCurator,
    required this.onTap,
  });

  final WeekDay day;
  final Claim? claim;
  final int meId;
  final bool showCurator;
  final VoidCallback? onTap;

  String? get _curatorLine {
    if (!showCurator || claim == null) return null;
    final by = claim!.claimedBy;
    if (by == null) return 'Куратор не назначен';
    return by.id == meId ? 'Куратор: вы' : 'Куратор: ${by.displayName}';
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final member = day.member;
    final curator = _curatorLine;
    return ChurchCard(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DateBadge(date: day.date, size: 48),
          const SizedBox(width: Space.md),
          Expanded(
            child: member == null
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text('Никто не назначен', style: TextStyle(fontSize: 14.5, color: palette.inkMuted)),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.displayName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          StatusPill(member.hasNeed ? 'НУЖДА ЕСТЬ' : 'ПУСТО', tone: member.hasNeed ? Tone.green : Tone.amber),
                          if (!member.inCycle) const StatusPill('ВНЕ ЦИКЛА', tone: Tone.neutral),
                        ],
                      ),
                      if (member.hasNeed) ...[
                        const SizedBox(height: 6),
                        Text(
                          member.prayerRequest,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13.5, height: 1.35, color: palette.inkMuted),
                        ),
                      ],
                      if (curator != null) ...[
                        const SizedBox(height: 6),
                        Text(curator, style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
                      ],
                    ],
                  ),
          ),
          if (onTap != null) Icon(Icons.chevron_right_rounded, color: palette.chevron),
        ],
      ),
    );
  }
}
