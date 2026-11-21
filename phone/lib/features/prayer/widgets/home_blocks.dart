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

/// Подпись даты именинника: «пт, 21 ноября».
String birthdayDate(DateTime date) => DateFormat('EEE, d MMMM', 'ru').format(date);

enum BirthdayStatus { today, tomorrow, soon }

BirthdayStatus birthdayStatus(DateTime date, DateTime now) {
  final diff = DateTime(date.year, date.month, date.day).difference(DateTime(now.year, now.month, now.day)).inDays;
  return diff <= 0 ? BirthdayStatus.today : (diff == 1 ? BirthdayStatus.tomorrow : BirthdayStatus.soon);
}

const _avatarPalettes = [
  (Color(0xFFFDE8E8), Color(0xFF7D3640)),
  (Color(0xFFEEEDFE), Color(0xFF4A3AAA)),
  (Color(0xFFE1F5EE), Color(0xFF0B6E56)),
  (Color(0xFFFAEEDA), Color(0xFF854F0B)),
  (Color(0xFFF4C0D1), Color(0xFF72243E)),
];

/// Цвет аватара зависит только от имени — один и тот же человек всегда одного цвета.
(Color, Color) birthdayPalette(String name) {
  var hash = 0;
  for (final unit in name.codeUnits) {
    hash = (unit + ((hash << 5) - hash)) & 0x7fffffff;
  }
  return _avatarPalettes[hash % _avatarPalettes.length];
}

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
  return parts.map((p) => String.fromCharCode(p.runes.first).toUpperCase()).join();
}

/// «Дни рождения» недели, как на сайте: значок торта, строки с аватаром, плашкой «Сегодня/Завтра»
/// и кнопкой «написать поздравление».
class BirthdaysCard extends StatelessWidget {
  const BirthdaysCard({super.key, required this.birthdays, required this.now, this.onMessage});

  final List<Birthday> birthdays;
  final DateTime now;
  final void Function(Birthday person)? onMessage;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
          child: Row(
            children: [
              Icon(Icons.cake_outlined, size: 14, color: palette.accent),
              const SizedBox(width: 6),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    'ДНИ РОЖДЕНИЯ',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: palette.inkMuted),
                  ),
                ),
              ),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: palette.hairline),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var i = 0; i < birthdays.length; i++) ...[
                if (i > 0) Divider(height: 1, color: palette.hairline),
                _BirthdayRow(person: birthdays[i], now: now, onMessage: onMessage == null ? null : () => onMessage!(birthdays[i])),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _BirthdayRow extends StatelessWidget {
  const _BirthdayRow({required this.person, required this.now, required this.onMessage});

  final Birthday person;
  final DateTime now;
  final VoidCallback? onMessage;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (bg, fg) = birthdayPalette(person.name);
    final status = birthdayStatus(person.date, now);
    final avatarBg = palette.isDark ? fg.withValues(alpha: 0.25) : bg;
    final avatarFg = palette.isDark ? Color.lerp(fg, Colors.white, 0.55)! : fg;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: avatarBg, shape: BoxShape.circle),
            child: Text(_initials(person.name), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: avatarFg)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      person.name,
                      style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.ink),
                    ),
                    if (status == BirthdayStatus.today)
                      _Pill('🎉 Сегодня', bg: ChurchColors.wine, fg: Colors.white)
                    else if (status == BirthdayStatus.tomorrow)
                      _Pill('Завтра', bg: palette.accentSoft, fg: palette.accent),
                  ],
                ),
                const SizedBox(height: 2),
                Text(birthdayDate(person.date), style: TextStyle(fontSize: 12.5, color: palette.inkMuted)),
              ],
            ),
          ),
          if (onMessage != null)
            Semantics(
              button: true,
              label: 'Написать поздравление: ${person.name}',
              excludeSemantics: true,
              child: SizedBox(
                width: 48,
                height: 48,
                child: Center(
                  child: Material(
                    color: avatarBg,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: onMessage,
                      child: SizedBox(width: 38, height: 38, child: Icon(Icons.chat_bubble_outline_rounded, size: 18, color: avatarFg)),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {required this.bg, required this.fg});
  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(text, softWrap: false, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: fg)),
      );
}
