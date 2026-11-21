import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';

const _weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Начало недели (понедельник) для даты.
DateTime weekStartOf(DateTime d) => _day(d).subtract(Duration(days: d.weekday - 1));

String _capitalized(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Плашка с датой, как на сайте: тап раскрывает календарь (неделя или весь месяц).
class PrayerDateChip extends StatelessWidget {
  const PrayerDateChip({super.key, required this.date, required this.expanded, required this.onTap});

  final DateTime date;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      expanded: expanded,
      label: 'Дата молитвы: ${longDate(date)}',
      child: Material(
        color: palette.card,
        shape: StadiumBorder(side: BorderSide(color: palette.hairline)),
        elevation: 0,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 14, 6),
              child: Row(
                children: [
                  const IconTile(Icons.calendar_month_outlined, tone: Tone.wine, size: 38, radius: 12),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      longDate(date),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: palette.ink),
                    ),
                  ),
                  if (sameDay(date, DateTime.now())) ...[
                    const SizedBox(width: 8),
                    const Flexible(child: StatusPill('СЕГОДНЯ', tone: Tone.red)),
                  ],
                  const SizedBox(width: 6),
                  AnimatedRotation(
                    turns: expanded ? 0.5 : 0,
                    duration: Motion.normal,
                    child: Icon(Icons.keyboard_arrow_down_rounded, color: palette.chevron, size: 26),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Раскрытый календарь: полоска недели с переключением недель и «Весь месяц».
class PrayerCalendarPanel extends StatefulWidget {
  const PrayerCalendarPanel({
    super.key,
    required this.selected,
    required this.onSelect,
    required this.onCollapse,
    required this.first,
    required this.last,
  });

  final DateTime selected;
  final ValueChanged<DateTime> onSelect;
  final VoidCallback onCollapse;
  final DateTime first;
  final DateTime last;

  @override
  State<PrayerCalendarPanel> createState() => _PrayerCalendarPanelState();
}

class _PrayerCalendarPanelState extends State<PrayerCalendarPanel> {
  bool _month = false;

  void _goWeek(int delta) {
    final next = widget.selected.add(Duration(days: 7 * delta));
    final clamped = next.isBefore(widget.first) ? widget.first : (next.isAfter(widget.last) ? widget.last : next);
    widget.onSelect(_day(clamped));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 4),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(Radii.card),
        border: Border.all(color: palette.hairline),
      ),
      child: Column(
        children: [
          if (_month)
            CalendarDatePicker(
              initialDate: widget.selected,
              firstDate: widget.first,
              lastDate: widget.last,
              onDateChanged: (d) => widget.onSelect(_day(d)),
            )
          else
            _WeekStrip(
              selected: widget.selected,
              first: widget.first,
              last: widget.last,
              onSelect: widget.onSelect,
              onWeek: _goWeek,
            ),
          Divider(height: 16, color: palette.hairline),
          Row(
            children: [
              Expanded(
                child: TextButton.icon(
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: palette.accent),
                  onPressed: () => setState(() => _month = !_month),
                  icon: Icon(_month ? Icons.view_week_outlined : Icons.calendar_month_outlined, size: 20),
                  label: Text(_month ? 'Неделя' : 'Весь месяц', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
              IconButton(
                tooltip: 'Свернуть календарь',
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                onPressed: widget.onCollapse,
                icon: Icon(Icons.keyboard_arrow_up_rounded, color: palette.inkMuted, size: 28),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WeekStrip extends StatelessWidget {
  const _WeekStrip({
    required this.selected,
    required this.first,
    required this.last,
    required this.onSelect,
    required this.onWeek,
  });

  final DateTime selected;
  final DateTime first;
  final DateTime last;
  final ValueChanged<DateTime> onSelect;
  final ValueChanged<int> onWeek;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final start = weekStartOf(selected);
    final days = [for (var i = 0; i < 7; i++) start.add(Duration(days: i))];
    final canPrev = start.isAfter(weekStartOf(first));
    final canNext = start.isBefore(weekStartOf(last));
    final today = _day(DateTime.now());
    return Column(
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'Предыдущая неделя',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: canPrev ? () => onWeek(-1) : null,
              icon: const Icon(Icons.chevron_left_rounded, size: 28),
            ),
            Expanded(
              child: Text(
                _capitalized(DateFormat('LLLL yyyy', 'ru').format(start)),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: palette.ink),
              ),
            ),
            IconButton(
              tooltip: 'Следующая неделя',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: canNext ? () => onWeek(1) : null,
              icon: const Icon(Icons.chevron_right_rounded, size: 28),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final label in _weekdays)
              Expanded(
                child: Center(
                  child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            for (final d in days)
              Expanded(
                child: _DayCell(
                  date: d,
                  selected: sameDay(d, selected),
                  today: sameDay(d, today),
                  enabled: !d.isBefore(_day(first)) && !d.isAfter(_day(last)),
                  onTap: () => onSelect(d),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.date, required this.selected, required this.today, required this.enabled, required this.onTap});

  final DateTime date;
  final bool selected;
  final bool today;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: longDate(date),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? onTap : null,
        child: SizedBox(
          height: 48,
          child: Center(
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: selected ? ChurchColors.wine : null,
                border: today && !selected ? Border.all(color: palette.accent, width: 1.5) : null,
              ),
              child: Text(
                '${date.day}',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: selected || today ? FontWeight.w800 : FontWeight.w500,
                  color: !enabled ? palette.inkFaint.withValues(alpha: 0.4) : (selected ? Colors.white : palette.ink),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
