import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class EventsPage extends StatefulWidget {
  const EventsPage({super.key});

  @override
  State<EventsPage> createState() => _EventsPageState();
}

class _EventsPageState extends State<EventsPage> with CacheWatcher<EventsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _events = const [];
  String _view = 'month';
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime? _selected;

  @override
  void initState() {
    super.initState();
    _load();
    watchCache(const ['/api/calendar/events'], _load);
  }

  Future<void> _load() async {
    try {
      final events = await ChurchApi(context.read<SessionController>()).events();
      if (!mounted) return;
      setState(() {
        _events = events;
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

  List<Map<String, dynamic>> get _sorted {
    final items = _events.map(asMap).toList();
    items.sort((a, b) {
      final da = parseApiDate(a['event_date']) ?? DateTime(9999);
      final db = parseApiDate(b['event_date']) ?? DateTime(9999);
      return da.compareTo(db);
    });
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final all = _sorted;
    final today = DateTime.now();
    final start = DateTime(today.year, today.month, today.day);
    final upcoming = all.where((e) {
      final d = parseApiDate(e['event_date']);
      return d == null || !d.isBefore(start);
    }).toList();
    final selected = _selected;
    final listed = _view == 'list'
        ? upcoming
        : selected != null
            ? all.where((e) {
                final d = parseApiDate(e['event_date']);
                return d != null && sameDay(d, selected);
              }).toList()
            : upcoming.where((e) {
                final d = parseApiDate(e['event_date']);
                return d != null && d.year == _month.year && d.month == _month.month;
              }).toList();
    final label = _view == 'list'
        ? 'Ближайшие'
        : selected != null
            ? 'События ${dayMonth(selected)}'
            : 'В этом месяце';
    return ChurchPage(
      title: 'Мероприятия',
      subtitle: upcoming.isEmpty ? null : 'Впереди: ${upcoming.length}',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          children: [
            SegmentedPills<String>(
              segments: const [('month', 'Месяц'), ('list', 'Список')],
              selected: _view,
              onChanged: (value) => setState(() => _view = value),
            ),
            if (_view == 'month')
              _MonthCalendar(
                month: _month,
                selected: _selected,
                eventDays: {
                  for (final e in all)
                    if (parseApiDate(e['event_date']) case final d?) DateTime(d.year, d.month, d.day),
                },
                onMonth: (delta) => setState(() {
                  _month = DateTime(_month.year, _month.month + delta);
                  _selected = null;
                }),
                onDay: (day) => setState(() => _selected = _selected != null && sameDay(_selected!, day) ? null : day),
              ),
            SectionLabel(label),
            if (listed.isEmpty)
              EmptyHint(
                _view == 'list' ? 'Активных мероприятий нет' : 'В этот период событий нет',
                icon: Icons.event_busy_outlined,
              )
            else
              for (final event in listed) _EventCard(event: event),
          ],
        ),
      ),
    );
  }
}

class _MonthCalendar extends StatelessWidget {
  const _MonthCalendar({
    required this.month,
    required this.selected,
    required this.eventDays,
    required this.onMonth,
    required this.onDay,
  });

  final DateTime month;
  final DateTime? selected;
  final Set<DateTime> eventDays;
  final ValueChanged<int> onMonth;
  final ValueChanged<DateTime> onDay;

  static const _weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final first = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final lead = first.weekday - 1;
    final today = DateTime.now();
    final cells = <Widget>[];
    for (var i = 0; i < lead; i++) {
      cells.add(const SizedBox.shrink());
    }
    for (var day = 1; day <= daysInMonth; day++) {
      final date = DateTime(month.year, month.month, day);
      final isSelected = selected != null && sameDay(selected!, date);
      final isToday = sameDay(today, date);
      final hasEvent = eventDays.contains(date);
      cells.add(Semantics(
        button: true,
        selected: isSelected,
        label: '${dayMonth(date)}${hasEvent ? ', есть события' : ''}',
        excludeSemantics: true,
        child: GestureDetector(
          onTap: () => onDay(date),
          child: Container(
            margin: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              gradient: isSelected ? wineGradient : null,
              borderRadius: BorderRadius.circular(12),
              border: isToday && !isSelected ? Border.all(color: palette.accent, width: 1.4) : null,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$day',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: isSelected || isToday ? FontWeight.w800 : FontWeight.w600,
                    color: isSelected ? Colors.white : palette.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: hasEvent ? (isSelected ? ChurchColors.amber : ChurchColors.danger) : Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        ),
      ));
    }
    final title = DateFormat('LLLL y', 'ru').format(month);
    return ChurchCard(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
      child: Column(
        children: [
          Row(
            children: [
              _MonthArrow(icon: Icons.chevron_left_rounded, tooltip: 'Предыдущий месяц', filled: false, onTap: () => onMonth(-1)),
              Expanded(
                child: Text(
                  '${title[0].toUpperCase()}${title.substring(1)}',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink),
                ),
              ),
              _MonthArrow(icon: Icons.chevron_right_rounded, tooltip: 'Следующий месяц', filled: true, onTap: () => onMonth(1)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final day in _weekdays)
                Expanded(
                  child: Text(
                    day,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: palette.inkFaint),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 0.95,
            children: cells,
          ),
        ],
      ),
    );
  }
}

class _MonthArrow extends StatelessWidget {
  const _MonthArrow({required this.icon, required this.tooltip, required this.filled, required this.onTap});

  final IconData icon;
  final String tooltip;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: filled ? ChurchColors.wine : palette.accentSoft,
        borderRadius: BorderRadius.circular(Radii.sm),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Icon(icon, color: filled ? Colors.white : palette.accent),
          ),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});
  final Map<String, dynamic> event;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final date = parseApiDate(event['event_date']);
    final time = shortTime(event['event_time']);
    final description = str(event['description']);
    return ChurchCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (date != null) DateBadge(date: date) else const IconTile(Icons.event_outlined, tone: Tone.green, size: 52),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(str(event['title']), style: ChurchType.title.copyWith(fontSize: 16, color: palette.ink)),
                const SizedBox(height: 2),
                Text(
                  [if (date != null) '${weekdayName(date)}, ${dayMonth(date)}', time].where((part) => part.isNotEmpty).join(' · '),
                  style: ChurchType.caption.copyWith(color: palette.inkMuted),
                ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(description, style: ChurchType.caption.copyWith(color: palette.inkMuted, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
