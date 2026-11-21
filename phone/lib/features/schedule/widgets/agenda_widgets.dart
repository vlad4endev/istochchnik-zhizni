import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/ministry_access.dart';
import '../logic/schedule_labels.dart';
import '../models/schedule_models.dart';

/// Цвет и подпись состояния назначения.
(String, Tone) statusLook(AssignmentStatus s) => switch (s) {
      AssignmentStatus.confirmed => ('Подтверждено', Tone.green),
      AssignmentStatus.declined => ('Отказ', Tone.red),
      AssignmentStatus.pending => ('Ждёт ответа', Tone.amber),
      AssignmentStatus.assigned => ('Ждёт ответа', Tone.amber),
    };

IconData ministryIcon(Ministry m) => switch (m) {
      Ministry.media => Icons.videocam_outlined,
      Ministry.music => Icons.music_note_rounded,
      Ministry.sunday => Icons.church_outlined,
    };

typedef AnswerCallback = Future<void> Function(AgendaItem item, AssignmentStatus status);

/// Крупная карточка ближайшего служения: главное на экране «Мои».
class NextServiceCard extends StatelessWidget {
  const NextServiceCard({super.key, required this.item, required this.today, required this.busy, required this.onAnswer});

  final AgendaItem item;
  final DateTime today;
  final bool busy;
  final AnswerCallback onAnswer;

  @override
  Widget build(BuildContext context) {
    final awaiting = item.awaitsAnswer;
    final subtitle = [if (item.startTime.isNotEmpty) item.startTime, item.title].join(' · ');
    return Semantics(
      container: true,
      label: 'Ближайшее служение. ${friendlyDay(item.date, today)}. $subtitle. Роль: ${item.roleName}',
      child: Container(
        decoration: BoxDecoration(gradient: wineGradient, borderRadius: BorderRadius.circular(Radii.card)),
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('БЛИЖАЙШЕЕ СЛУЖЕНИЕ', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: Color(0xB8FFFFFF))),
            const SizedBox(height: 8),
            Text(friendlyDay(item.date, today), style: ChurchType.serifTitle.copyWith(fontSize: 26, color: Colors.white)),
            const SizedBox(height: 2),
            Text(subtitle, style: const TextStyle(fontSize: 14.5, color: Color(0xE6FFFFFF))),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _OnDarkChip(icon: ministryIcon(item.ministry), text: item.ministry.shortLabel),
                _OnDarkChip(text: item.roleName, dot: item.roleColor),
                if (item.canAnswer && !awaiting) _OnDarkChip(text: statusLook(item.status!).$1, icon: item.status == AssignmentStatus.confirmed ? Icons.check_rounded : Icons.close_rounded),
              ],
            ),
            if (awaiting) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _OnDarkButton(label: 'Подтвердить', filled: true, busy: busy, onTap: () => onAnswer(item, AssignmentStatus.confirmed))),
                  const SizedBox(width: 10),
                  Expanded(child: _OnDarkButton(label: 'Не смогу', filled: false, busy: busy, onTap: () => onAnswer(item, AssignmentStatus.declined))),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _OnDarkChip extends StatelessWidget {
  const _OnDarkChip({required this.text, this.icon, this.dot});
  final String text;
  final IconData? icon;
  final Color? dot;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 30),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: const Color(0x26FFFFFF), borderRadius: BorderRadius.circular(15)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 15, color: Colors.white), const SizedBox(width: 5)],
            if (dot != null) ...[Container(width: 9, height: 9, decoration: BoxDecoration(color: dot, shape: BoxShape.circle, border: Border.all(color: Colors.white54))), const SizedBox(width: 6)],
            Flexible(child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white))),
          ],
        ),
      );
}

class _OnDarkButton extends StatelessWidget {
  const _OnDarkButton({required this.label, required this.filled, required this.busy, required this.onTap});
  final String label;
  final bool filled;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        enabled: !busy,
        label: label,
        excludeSemantics: true,
        child: Material(
          color: filled ? ChurchColors.creamButton : const Color(0x1FFFFFFF),
          borderRadius: BorderRadius.circular(Radii.xl),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: busy ? null : onTap,
            child: Container(
              height: 48,
              alignment: Alignment.center,
              decoration: filled ? null : BoxDecoration(borderRadius: BorderRadius.circular(Radii.xl), border: Border.all(color: const Color(0x66FFFFFF))),
              child: busy
                  ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: filled ? ChurchColors.wine : Colors.white))
                  : Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: filled ? ChurchColors.wineDeep : Colors.white)),
            ),
          ),
        ),
      );
}

/// «Ждут вашего ответа: N» с ответом на всё сразу.
class PendingBanner extends StatelessWidget {
  const PendingBanner({super.key, required this.count, required this.busy, required this.onConfirmAll});

  final int count;
  final bool busy;
  final VoidCallback onConfirmAll;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = Tone.amber;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        decoration: BoxDecoration(color: tone.bg(palette), borderRadius: BorderRadius.circular(Radii.lg)),
        child: Row(
          children: [
            Icon(Icons.hourglass_top_rounded, size: 20, color: tone.fg(palette)),
            const SizedBox(width: 10),
            Expanded(
              child: Text('Ждут вашего ответа: ${awaitingText(count)}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, height: 1.3, color: palette.ink)),
            ),
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: palette.accent),
              onPressed: busy ? null : onConfirmAll,
              child: const Text('Подтвердить все', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Строка ленты: дата, что и где, роль, состояние и кнопки ответа.
class AgendaCard extends StatelessWidget {
  const AgendaCard({super.key, required this.item, required this.today, required this.busy, required this.onAnswer});

  final AgendaItem item;
  final DateTime today;
  final bool busy;
  final AnswerCallback onAnswer;

  Future<void> _decline(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Отказаться от служения?'),
        content: Text('${item.roleName} — ${friendlyDay(item.date, today).toLowerCase()}, ${item.title}. Ответ можно будет изменить.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Оставить')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Отказаться')),
        ],
      ),
    );
    if (ok == true) await onAnswer(item, AssignmentStatus.declined);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final status = item.status;
    final (label, tone) = status == null ? ('', Tone.neutral) : statusLook(status);
    final declined = status == AssignmentStatus.declined;
    final line = [if (item.startTime.isNotEmpty) item.startTime, item.ministry.shortLabel].join(' · ');
    return Opacity(
      opacity: declined ? 0.7 : 1,
      child: ChurchCard(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DateBadge(date: item.date),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(friendlyDay(item.date, today), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                        const SizedBox(height: 2),
                        Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink)),
                        const SizedBox(height: 2),
                        Text(line, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            _RolePill(name: item.roleName, color: item.roleColor),
                            if (label.isNotEmpty) StatusPill(label, tone: tone),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (item.canAnswer) ...[
              Divider(height: 1, color: palette.hairline),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                child: _Actions(item: item, busy: busy, onAnswer: onAnswer, onDecline: () => _decline(context)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.item, required this.busy, required this.onAnswer, required this.onDecline});

  final AgendaItem item;
  final bool busy;
  final AnswerCallback onAnswer;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (item.awaitsAnswer) {
      return Row(
        children: [
          Expanded(child: PrimaryButton(label: 'Подтвердить', icon: Icons.check_rounded, height: 46, busy: busy, onPressed: () => onAnswer(item, AssignmentStatus.confirmed))),
          const SizedBox(width: 10),
          Expanded(child: SecondaryButton(label: 'Не смогу', height: 46, danger: true, onPressed: busy ? null : onDecline)),
        ],
      );
    }
    final declined = item.status == AssignmentStatus.declined;
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton.icon(
        style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: declined ? palette.accent : ChurchColors.danger),
        onPressed: busy ? null : (declined ? () => onAnswer(item, AssignmentStatus.confirmed) : onDecline),
        icon: Icon(declined ? Icons.check_rounded : Icons.close_rounded, size: 18),
        label: Text(declined ? 'Передумал — подтвердить' : 'Не смогу', style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _RolePill extends StatelessWidget {
  const _RolePill({required this.name, this.color});
  final String name;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final base = color ?? palette.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: base.withValues(alpha: palette.isDark ? 0.25 : 0.14), borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: base, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Flexible(child: Text(name, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.ink))),
        ],
      ),
    );
  }
}
