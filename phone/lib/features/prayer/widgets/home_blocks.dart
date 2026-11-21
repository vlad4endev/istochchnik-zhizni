import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/plural.dart';
import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';
import '../prayer_controllers.dart';

/// «Координаторам сбора» на главной: свои участники или обзор незаполненных нужд.
class CoordinatorSummaryCard extends StatelessWidget {
  const CoordinatorSummaryCard({super.key, required this.summary, required this.meId, required this.onOpen});

  final CoordinatorSummary summary;
  final int meId;
  final VoidCallback onOpen;

  static const _maxRows = 6;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final rows = summary.rows;
    final shown = rows.take(_maxRows).toList();
    final extra = rows.length - shown.length;
    final title = summary.overview
        ? 'На этой неделе не заполнена нужда:'
        : 'Ваши участники на следующую неделю:';
    final empty = summary.overview
        ? 'На этой неделе у всех участников цикла нужды заполнены.'
        : 'На следующую неделю за вами пока нет закреплённых участников.';
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const IconTile(Icons.assignment_outlined, tone: Tone.wine, size: 38),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Координаторам сбора',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: palette.ink),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (rows.isEmpty)
            Text(empty, style: TextStyle(fontSize: 14, height: 1.4, color: palette.inkMuted))
          else ...[
            Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: palette.ink)),
            if (!summary.overview) ...[
              const SizedBox(height: 4),
              Text(
                'Нужда заполнена у ${summary.filled} из ${rows.length}',
                style: TextStyle(fontSize: 12.5, color: palette.inkMuted),
              ),
            ],
            const SizedBox(height: 8),
            for (final day in shown) _Row(day: day, summary: summary, meId: meId),
            if (extra > 0)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'и ещё $extra ${pluralRu(extra, 'день', 'дня', 'дней')}',
                  style: TextStyle(fontSize: 12.5, color: palette.inkFaint),
                ),
              ),
          ],
          const SizedBox(height: 12),
          PrimaryButton(
            label: summary.overview ? 'Открыть очередь' : 'Заполнить нужды',
            icon: Icons.arrow_forward_rounded,
            height: 48,
            onPressed: onOpen,
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.day, required this.summary, required this.meId});

  final WeekDay day;
  final CoordinatorSummary summary;
  final int meId;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final member = day.member!;
    final curator = summary.overview ? summary.claims.of(member.id)?.claimedBy : null;
    final detail = [
      DateFormat('EEE d.MM', 'ru').format(day.date),
      if (summary.overview) curator == null ? 'куратор не назначен' : 'куратор: ${curator.displayName}',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.ink),
                ),
                Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: palette.inkMuted)),
              ],
            ),
          ),
          if (!summary.overview)
            Semantics(
              label: member.hasNeed ? 'Нужда заполнена' : 'Нужда не заполнена',
              child: Icon(
                member.hasNeed ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded,
                color: member.hasNeed ? ChurchColors.success : ChurchColors.danger,
                size: 22,
              ),
            ),
        ],
      ),
    );
  }
}

String birthdayWhen(DateTime date, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  final diff = DateTime(date.year, date.month, date.day).difference(today).inDays;
  if (diff == 0) return 'Сегодня';
  if (diff == 1) return 'Завтра';
  return DateFormat('EEEE, d MMMM', 'ru').format(date);
}

/// Дни рождения ближайшей недели; тап по человеку — написать ему.
class BirthdaysCard extends StatelessWidget {
  const BirthdaysCard({super.key, required this.birthdays, required this.now, this.onMessage});

  final List<Birthday> birthdays;
  final DateTime now;
  final void Function(Birthday person)? onMessage;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchCard(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          for (var i = 0; i < birthdays.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 70, color: palette.hairline),
            ListRow(
              leading: ChurchAvatar(name: birthdays[i].name, size: 42),
              title: birthdays[i].name,
              subtitle: birthdayWhen(birthdays[i].date, now),
              trailing: onMessage == null ? null : Icon(Icons.chat_bubble_outline_rounded, color: palette.accent, size: 20),
              onTap: onMessage == null ? null : () => onMessage!(birthdays[i]),
            ),
          ],
        ],
      ),
    );
  }
}
