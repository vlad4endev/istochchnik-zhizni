import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/plan_logic.dart';
import '../models/plan_models.dart';

IconData blockIcon(BlockKind kind) => switch (kind) {
      BlockKind.song => Icons.music_note_rounded,
      BlockKind.sermon => Icons.mic_none_rounded,
      BlockKind.poem => Icons.auto_stories_outlined,
      BlockKind.birthdays => Icons.cake_outlined,
      BlockKind.schedule => Icons.event_note_outlined,
      BlockKind.other => Icons.circle_outlined,
    };

Tone blockTone(BlockKind kind) => switch (kind) {
      BlockKind.song => Tone.rose,
      BlockKind.sermon => Tone.teal,
      BlockKind.poem => Tone.violet,
      BlockKind.birthdays => Tone.amber,
      BlockKind.schedule => Tone.green,
      BlockKind.other => Tone.neutral,
    };

/// Один блок программы на ленте: слева время и линия, справа карточка.
class TimelineBlock extends StatelessWidget {
  const TimelineBlock({
    super.key,
    required this.block,
    required this.details,
    required this.start,
    required this.mine,
    required this.current,
    required this.first,
    required this.last,
    this.onSong,
    this.onScripture,
    this.songBusy = false,
  });

  final PlanBlock block;
  final BlockDetails details;
  final String? start;
  final bool mine;
  final bool current;
  final bool first;
  final bool last;
  final VoidCallback? onSong;
  final VoidCallback? onScripture;
  final bool songBusy;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = blockTone(block.kind);
    final minutes = block.durationMinutes > 0 ? '${block.durationMinutes} мин' : '';
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 52,
            child: Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(start ?? '', textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: current ? palette.accent : palette.inkMuted)),
            ),
          ),
          SizedBox(
            width: 24,
            child: Stack(
              alignment: Alignment.topCenter,
              children: [
                Positioned.fill(
                  child: Center(child: Container(width: 2, margin: EdgeInsets.only(top: first ? 22 : 0, bottom: last ? 0 : 0), color: palette.outline)),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 18),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: current ? palette.accent : palette.sheet,
                      shape: BoxShape.circle,
                      border: Border.all(color: current || mine ? palette.accent : tone.fg(palette), width: 2.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : Space.md),
              child: Semantics(
                container: true,
                label: [
                  ?start,
                  details.heading,
                  if (minutes.isNotEmpty) minutes,
                  if (mine) 'вы',
                  if (current) 'сейчас идёт',
                ].join(', '),
                child: ChurchCard(
                  padding: EdgeInsets.zero,
                  border: mine || current ? Border.all(color: palette.accent.withValues(alpha: 0.6), width: 1.5) : null,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            IconTile(blockIcon(block.kind), tone: tone, size: 34, radius: 10, iconSize: 18),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(details.heading, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink)),
                            ),
                          ],
                        ),
                        if (minutes.isNotEmpty || mine || current)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                if (current) const StatusPill('Сейчас', solid: true),
                                if (mine) const StatusPill('Вы', tone: Tone.wine, solid: true),
                                if (minutes.isNotEmpty) StatusPill(minutes, tone: Tone.neutral),
                              ],
                            ),
                          ),
                        if (details.speaker.isNotEmpty) _Line(icon: Icons.person_outline_rounded, text: details.speaker),
                        if (details.songLine.isNotEmpty)
                          _Action(icon: Icons.music_note_outlined, text: details.songLine, hint: onSong == null ? null : 'Открыть текст и аккорды', busy: songBusy, onTap: onSong),
                        if (details.subline.isNotEmpty) _Line(icon: Icons.edit_note_rounded, text: details.subline),
                        if (details.scripture.isNotEmpty)
                          _Action(icon: Icons.menu_book_outlined, text: details.scripture, hint: onScripture == null ? null : 'Открыть в Библии', onTap: onScripture),
                        if (details.note.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(details.note, style: TextStyle(fontSize: 14, height: 1.45, color: palette.inkMuted)),
                          ),
                        for (final line in details.list) _Line(icon: Icons.circle, text: line, small: true),
                        for (final line in details.stage) _Line(icon: Icons.mic_external_on_outlined, text: line),
                      ],
                    ),
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

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.small = false});
  final IconData icon;
  final String text;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: EdgeInsets.only(top: small ? 7 : 2), child: Icon(icon, size: small ? 6 : 16, color: palette.inkFaint)),
          SizedBox(width: small ? 10 : 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 14, height: 1.4, color: palette.ink))),
        ],
      ),
    );
  }
}

/// Строка-ссылка: песня открывает песенник, место Писания — Библию. Зона нажатия не меньше 48 px.
class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.text, required this.hint, required this.onTap, this.busy = false});
  final IconData icon;
  final String text;
  final String? hint;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tappable = onTap != null;
    final content = Row(
      children: [
        Icon(icon, size: 18, color: tappable ? palette.accent : palette.inkFaint),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: tappable ? palette.accent : palette.ink)),
        ),
        if (busy)
          const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2))
        else if (tappable)
          Icon(Icons.chevron_right_rounded, size: 20, color: palette.accent),
      ],
    );
    if (!tappable) return Padding(padding: const EdgeInsets.only(top: 6), child: content);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Semantics(
        button: true,
        label: '$text. ${hint ?? ''}',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.sm),
          onTap: busy ? null : onTap,
          child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 48), child: content),
        ),
      ),
    );
  }
}

/// Карточка с «шапкой» программы: время, длительность, ведущий и проповедник.
class PlanHeaderCard extends StatelessWidget {
  const PlanHeaderCard({super.key, required this.plan, required this.timeline, required this.meId});

  final PlanView plan;
  final Timeline timeline;
  final int meId;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final s = plan.summary;
    final facts = [
      if (s.startTime.isNotEmpty) ('Начало', s.startTime),
      if (timeline.end != null) ('Конец ≈', timeline.end!),
      if (timeline.totalMinutes > 0) ('Длительность', durationText(timeline.totalMinutes)),
    ];
    return ChurchCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (facts.isNotEmpty)
            Row(
              children: [
                for (var i = 0; i < facts.length; i++) ...[
                  if (i > 0) Container(width: 1, height: 34, color: palette.hairline, margin: const EdgeInsets.symmetric(horizontal: 12)),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(facts[i].$1, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                        Text(facts[i].$2, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink)),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          if (plan.leaderName.isNotEmpty || plan.preacherName.isNotEmpty) ...[
            if (facts.isNotEmpty) Divider(height: 24, color: palette.hairline),
            if (plan.leaderName.isNotEmpty) _Person(role: 'Ведущий', name: plan.leaderName, mine: s.leaderId == meId && meId > 0),
            if (plan.leaderName.isNotEmpty && plan.preacherName.isNotEmpty) const SizedBox(height: 10),
            if (plan.preacherName.isNotEmpty) _Person(role: 'Проповедник', name: plan.preacherName, mine: s.preacherId == meId && meId > 0),
          ],
        ],
      ),
    );
  }
}

class _Person extends StatelessWidget {
  const _Person({required this.role, required this.name, required this.mine});
  final String role;
  final String name;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Row(
      children: [
        ChurchAvatar(name: name, size: 36),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(role, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
              Text(name, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.ink)),
            ],
          ),
        ),
        if (mine) const StatusPill('Вы', tone: Tone.wine, solid: true),
      ],
    );
  }
}

/// Команда трансляции: роль и человек.
class BroadcastCard extends StatelessWidget {
  const BroadcastCard({super.key, required this.people});
  final List<BroadcastPerson> people;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < people.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 28, color: palette.hairline),
            ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 52),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(
                  children: [
                    Container(width: 4, height: 28, decoration: BoxDecoration(color: people[i].color, borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 10),
                    Expanded(flex: 4, child: Text(people[i].role, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: palette.ink))),
                    Expanded(flex: 6, child: Text(people[i].name, textAlign: TextAlign.right, style: TextStyle(fontSize: 14.5, color: palette.ink))),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
