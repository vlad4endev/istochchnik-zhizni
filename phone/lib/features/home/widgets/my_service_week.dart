import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../schedule/models/schedule_models.dart' show AssignmentStatus;
import '../models/home_models.dart';

const _maroon = Color(0xFF732B38);
const _weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

/// «Твоё служение на этой неделе»: карточки с датой слева, ролями и кнопками ответа.
class MyServiceWeek extends StatelessWidget {
  const MyServiceWeek({
    super.key,
    required this.cards,
    required this.answering,
    required this.error,
    required this.onAnswer,
    required this.onOpen,
  });

  final List<MyServiceCard> cards;
  final Set<String> answering;
  final String? error;
  final void Function(MyServiceCard card, AssignmentStatus status) onAnswer;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    if (cards.isEmpty) return const SizedBox.shrink();
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
          child: Semantics(
            header: true,
            child: Text(
              'ТВОЁ СЛУЖЕНИЕ НА ЭТОЙ НЕДЕЛЕ',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: palette.isDark ? palette.accent : _maroon),
            ),
          ),
        ),
        for (var i = 0; i < cards.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _Card(
            card: cards[i],
            busy: answering.contains(cards[i].key),
            error: error,
            onAnswer: (s) => onAnswer(cards[i], s),
            onOpen: onOpen,
          ),
        ],
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.card, required this.busy, required this.error, required this.onAnswer, required this.onOpen});

  final MyServiceCard card;
  final bool busy;
  final String? error;
  final ValueChanged<AssignmentStatus> onAnswer;
  final VoidCallback onOpen;

  (IconData, Color, Color) get _ministry => switch (card.ministry) {
        ServiceMinistry.music => (Icons.music_note_rounded, const Color(0xFFF3E8FF), const Color(0xFF7C3AED)),
        ServiceMinistry.media => (Icons.videocam_outlined, const Color(0xFFE0F2FE), const Color(0xFF0369A1)),
        ServiceMinistry.sunday => (Icons.auto_awesome_outlined, const Color(0xFFF8F2F4), _maroon),
      };

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (icon, chipBg, chipFg) = _ministry;
    final pending = card.pending;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _DateSidebar(date: card.date),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 28,
                                  height: 28,
                                  decoration: BoxDecoration(color: palette.isDark ? chipFg.withValues(alpha: 0.2) : chipBg, shape: BoxShape.circle),
                                  child: Icon(icon, size: 14, color: palette.isDark ? Color.lerp(chipFg, Colors.white, 0.4) : chipFg),
                                ),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: Text(
                                    card.ministry.label,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: palette.inkMuted),
                                  ),
                                ),
                              ],
                            ),
                            if (card.hasStatus) _StatusBadge(status: card.status),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _Roles(roles: card.roles),
                        const SizedBox(height: 6),
                        Text(card.eventTitle, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: palette.inkMuted)),
                        if (card.hasStatus && pending.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: _AnswerButton(
                                  label: pending.length > 1 ? 'Подтвердить все' : 'Подтвердить',
                                  filled: true,
                                  onPressed: busy ? null : () => onAnswer(AssignmentStatus.confirmed),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _AnswerButton(
                                  label: pending.length > 1 ? 'Отказать по всем' : 'Отказать',
                                  filled: false,
                                  onPressed: busy ? null : () => onAnswer(AssignmentStatus.declined),
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (error != null && card.hasStatus && pending.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(error!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFE11D48))),
                        ],
                      ],
                    ),
                  ),
                  Divider(height: 1, color: palette.hairline),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 6, 0),
                    child: Row(
                      children: [
                        Icon(Icons.schedule_rounded, size: 16, color: palette.inkMuted),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            card.startTime.isEmpty ? '—' : card.startTime,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: palette.inkMuted),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          flex: 2,
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              style: TextButton.styleFrom(
                                minimumSize: const Size(48, 44),
                                foregroundColor: palette.isDark ? palette.accent : _maroon,
                              ),
                              onPressed: onOpen,
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text('Подробнее', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800)),
                                  ),
                                  SizedBox(width: 4),
                                  Icon(Icons.open_in_new_rounded, size: 14),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateSidebar extends StatelessWidget {
  const _DateSidebar({required this.date});
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${date.day} ${DateFormat('MMMM', 'ru').format(date)}',
      excludeSemantics: true,
      child: Container(
        width: 74,
        color: _maroon,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_weekdays[date.weekday - 1], style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Color(0xD9FFFFFF))),
              Text('${date.day}', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1.05, color: Colors.white)),
              Text(
                DateFormat('LLLL', 'ru').format(date),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xE6FFFFFF)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final AssignmentStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg, icon) = switch (status) {
      AssignmentStatus.confirmed => ('Подтверждено', const Color(0xFFE8F5EC), const Color(0xFF2F6B3C), Icons.check_rounded),
      AssignmentStatus.declined => ('Отказ', const Color(0xFFFFF1F2), const Color(0xFFBE123C), Icons.close_rounded),
      _ => ('Нужен ответ', const Color(0xFFFFFBEB), const Color(0xFF92400E), null),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, softWrap: false, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: fg))),
        ],
      ),
    );
  }
}

class _Roles extends StatelessWidget {
  const _Roles({required this.roles});
  final List<MyRole> roles;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (roles.length <= 1) {
      return Text(
        'Служение: ${roles.isEmpty ? '—' : roles.first.roleName}',
        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.3, color: palette.ink),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('СЛУЖЕНИЕ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.9, color: palette.inkFaint)),
        const SizedBox(height: 6),
        for (final role in roles)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: role.color, shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    role.roleName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: palette.ink),
                  ),
                ),
                if (role.status == AssignmentStatus.confirmed)
                  const Icon(Icons.check_circle_rounded, size: 18, color: Color(0xFF2F6B3C))
                else if (role.status == AssignmentStatus.declined)
                  const Icon(Icons.cancel_rounded, size: 18, color: Color(0xFFE11D48))
                else if (role.status.awaitsAnswer)
                  const Icon(Icons.help_outline_rounded, size: 18, color: Color(0xFF92400E)),
              ],
            ),
          ),
      ],
    );
  }
}

class _AnswerButton extends StatelessWidget {
  const _AnswerButton({required this.label, required this.filled, required this.onPressed});
  final String label;
  final bool filled;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
    final text = Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, height: 1.15));
    return SizedBox(
      height: 48,
      child: filled
          ? FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _maroon, foregroundColor: Colors.white, shape: shape, padding: const EdgeInsets.symmetric(horizontal: 6)),
              onPressed: onPressed,
              child: text,
            )
          : OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: palette.ink,
                side: BorderSide(color: palette.outline),
                shape: shape,
                padding: const EdgeInsets.symmetric(horizontal: 6),
              ),
              onPressed: onPressed,
              child: text,
            ),
    );
  }
}
