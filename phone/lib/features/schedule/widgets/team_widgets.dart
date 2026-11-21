import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../logic/schedule_labels.dart';
import '../models/schedule_models.dart';
import 'agenda_widgets.dart';

/// Переключатель недели: ‹ 16–22 ноября ›, и быстрый возврат к текущей.
class WeekBar extends StatelessWidget {
  const WeekBar({super.key, required this.monday, required this.thisWeek, required this.onShift, required this.onToday});

  final DateTime monday;
  final bool thisWeek;
  final ValueChanged<int> onShift;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchCard(
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          IconButton(tooltip: 'Предыдущая неделя', onPressed: () => onShift(-1), icon: Icon(Icons.chevron_left_rounded, color: palette.accent)),
          Expanded(
            child: Semantics(
              liveRegion: true,
              label: 'Неделя ${weekRange(monday)}',
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(weekRange(monday), textAlign: TextAlign.center, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: palette.ink)),
                  if (thisWeek)
                    Text('эта неделя', style: TextStyle(fontSize: 12, color: palette.inkMuted))
                  else
                    GestureDetector(
                      onTap: onToday,
                      behavior: HitTestBehavior.opaque,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 28),
                        child: Center(child: Text('К этой неделе', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.accent))),
                      ),
                    ),
                ],
              ),
            ),
          ),
          IconButton(tooltip: 'Следующая неделя', onPressed: () => onShift(1), icon: Icon(Icons.chevron_right_rounded, color: palette.accent)),
        ],
      ),
    );
  }
}

/// Одна строка «роль — человек»: свободная роль, назначенный (со статусом) или «вы».
class RoleRow extends StatelessWidget {
  const RoleRow({super.key, required this.role, required this.assignment, required this.me, this.onTap});

  final ScheduleRole role;
  final ScheduleAssignment? assignment;
  final int me;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final a = assignment;
    final mine = a != null && a.memberId == me;
    final (statusLabel, tone) = a == null ? ('', Tone.neutral) : statusLook(a.status);
    return Semantics(
      button: onTap != null,
      label: a == null ? '${role.name}: свободно${onTap != null ? ', назначить' : ''}' : '${role.name}: ${a.memberName}${mine ? ' (вы)' : ''}, $statusLabel',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Container(
            color: mine ? palette.accentSoft : null,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              children: [
                Container(width: 4, height: 32, decoration: BoxDecoration(color: role.color, borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 10),
                Expanded(
                  flex: 5,
                  // Длинное название роли («Звукорежиссёр») уменьшается, а не рвётся посреди слова.
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(role.name, maxLines: 1, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.ink)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 5,
                  child: a == null
                      ? Align(
                          alignment: Alignment.centerRight,
                          child: Text(onTap != null ? 'Назначить' : 'Свободно', style: TextStyle(fontSize: 14, fontWeight: onTap != null ? FontWeight.w700 : FontWeight.w500, color: onTap != null ? palette.accent : palette.inkFaint)),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Flexible(
                              child: Text(mine ? '${a.memberName} · вы' : a.memberName, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.right, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: palette.ink)),
                            ),
                            const SizedBox(width: 8),
                            _StatusDot(tone: tone, status: a.status),
                          ],
                        ),
                ),
                if (onTap != null) Padding(padding: const EdgeInsets.only(left: 4), child: Icon(Icons.chevron_right_rounded, size: 20, color: palette.chevron)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.tone, required this.status});
  final Tone tone;
  final AssignmentStatus status;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final icon = switch (status) {
      AssignmentStatus.confirmed => Icons.check_circle_rounded,
      AssignmentStatus.declined => Icons.cancel_rounded,
      _ => Icons.schedule_rounded,
    };
    return Icon(icon, size: 20, color: tone.fg(palette));
  }
}

/// Собрание с командой: заголовок и список ролей.
class EventTeamCard extends StatelessWidget {
  const EventTeamCard({super.key, required this.event, required this.roles, required this.me, required this.manage, required this.onRole});

  final ScheduleEvent event;
  final List<ScheduleRole> roles;
  final int me;
  final bool manage;
  final void Function(ScheduleRole role, ScheduleAssignment? current) onRole;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final byRole = {for (final a in event.assignments) a.role.id: a};
    // Роли, которых нет в справочнике (удалённые), всё равно показываем — по назначению.
    final known = {for (final r in roles) r.id};
    final extra = [for (final a in event.assignments) if (!known.contains(a.role.id)) a.role];
    final rows = [...roles, ...extra];
    final visible = manage ? rows : [for (final r in rows) if (byRole.containsKey(r.id)) r];
    final vacant = rows.length - byRole.length;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Row(
              children: [
                DateBadge(date: event.date),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(weekdayName(event.date), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                      Text(event.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, color: palette.ink)),
                      if (event.startTime.isNotEmpty) Text('Начало ${event.startTime}', style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (visible.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Text('Команду ещё не назначили', style: TextStyle(fontSize: 14, color: palette.inkMuted)),
            )
          else ...[
            Divider(height: 1, color: palette.hairline),
            for (var i = 0; i < visible.length; i++) ...[
              if (i > 0) Divider(height: 1, indent: 28, color: palette.hairline),
              RoleRow(
                role: visible[i],
                assignment: byRole[visible[i].id],
                me: me,
                onTap: manage ? () => onRole(visible[i], byRole[visible[i].id]) : null,
              ),
            ],
          ],
          if (!manage && vacant > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
              child: Text('Не назначено ролей: $vacant', style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
            ),
        ],
      ),
    );
  }
}

/// Воскресное собрание: ведущий и проповедник.
class SundayTeamCard extends StatelessWidget {
  const SundayTeamCard({super.key, required this.plan, required this.me, required this.manage, required this.onLeader, required this.onPreacher});

  final SundayPlan plan;
  final int me;
  final bool manage;
  final VoidCallback onLeader;
  final VoidCallback onPreacher;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Row(
              children: [
                DateBadge(date: plan.date),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, color: palette.ink)),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (plan.startTime.isNotEmpty) Text('Начало ${plan.startTime}', style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                          StatusPill(plan.published ? 'Программа готова' : 'Программа в работе', tone: plan.published ? Tone.green : Tone.neutral),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: palette.hairline),
          _PersonRow(label: 'Ведущий', person: plan.leader, me: me, onTap: manage ? onLeader : null),
          Divider(height: 1, indent: 14, color: palette.hairline),
          _PersonRow(label: 'Проповедник', person: plan.preacher, me: me, onTap: manage ? onPreacher : null),
        ],
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.label, required this.person, required this.me, this.onTap});

  final String label;
  final PersonRef? person;
  final int me;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final p = person;
    final mine = p != null && p.id == me;
    return Semantics(
      button: onTap != null,
      label: p == null ? '$label: не назначен${onTap != null ? ', назначить' : ''}' : '$label: ${p.name}${mine ? ' (вы)' : ''}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 60),
          child: Container(
            color: mine ? palette.accentSoft : null,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              children: [
                if (p != null) ChurchAvatar(name: p.name, imageUrl: p.avatarUrl, size: 38) else const IconTile(Icons.person_add_alt_1_outlined, tone: Tone.neutral, size: 38),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                      Text(
                        p == null ? (onTap != null ? 'Назначить' : 'Не назначен') : (mine ? '${p.name} · вы' : p.name),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: p == null ? (onTap != null ? palette.accent : palette.inkFaint) : palette.ink),
                      ),
                    ],
                  ),
                ),
                if (onTap != null) Icon(Icons.chevron_right_rounded, color: palette.chevron),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
