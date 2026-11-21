import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/home_logic.dart';
import '../models/home_models.dart';

/// Одна кнопка быстрого перехода.
class QuickAction {
  const QuickAction({required this.label, required this.icon, required this.tone, required this.onTap});
  final String label;
  final IconData icon;
  final Tone tone;
  final VoidCallback onTap;
}

/// Три кнопки в один ряд: иконка в кружке над подписью (до двух строк), как на сайте.
class QuickActionsStrip extends StatelessWidget {
  const QuickActionsStrip({super.key, required this.actions});

  final List<QuickAction> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    // IntrinsicHeight: в прокручиваемом списке высота не ограничена, а кнопки должны быть одной высоты.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < actions.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: _QuickActionButton(action: actions[i])),
          ],
        ],
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  const _QuickActionButton({required this.action});
  final QuickAction action;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = action.tone;
    return Semantics(
      button: true,
      label: action.label,
      excludeSemantics: true,
      child: Material(
        color: palette.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.lg),
          side: BorderSide(color: palette.hairline),
        ),
        child: InkWell(
          customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
          onTap: action.onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(color: tone.bg(palette), shape: BoxShape.circle),
                    child: Icon(action.icon, size: 16, color: tone.fg(palette)),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    action.label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, height: 1.15, color: palette.ink),
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

/// Карточка с мягким цветным градиентом: «Молимся сегодня», «Мероприятия».
class _TintCard extends StatelessWidget {
  const _TintCard({
    required this.label,
    required this.labelColor,
    required this.light,
    required this.dark,
    required this.border,
    required this.iconBg,
    required this.icon,
    required this.titleColor,
    required this.title,
    required this.subtitleColor,
    required this.subtitle,
    required this.onTap,
    this.hint,
    this.hintColor,
    this.minHeight = 132,
  });

  final String label;
  final Color labelColor;
  final List<Color> light;
  final Color dark;
  final Color border;
  final Color iconBg;
  final IconData icon;
  final Color titleColor;
  final String title;
  final Color subtitleColor;
  final String subtitle;
  final VoidCallback onTap;
  final String? hint;
  final Color? hintColor;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final isDark = palette.isDark;
    return Semantics(
      button: true,
      container: true,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            gradient: isDark ? null : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: light),
            color: isDark ? dark : null,
            borderRadius: BorderRadius.circular(Radii.card),
            border: Border.all(color: isDark ? border.withValues(alpha: 0.35) : border),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(Radii.card),
            onTap: onTap,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: minHeight),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: isDark ? palette.inkMuted : labelColor),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(Radii.md)),
                          child: Icon(icon, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.25, color: isDark ? palette.ink : titleColor),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                subtitle,
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, height: 1.3, color: isDark ? iconBg.withValues(alpha: 1) : subtitleColor),
                              ),
                              if (hint != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                  hint!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, height: 1.3, color: isDark ? palette.inkMuted : hintColor),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// «Молимся сегодня»: день и за кого молимся. Тап открывает «Молитву».
class PrayerTodayCard extends StatelessWidget {
  const PrayerTodayCard({super.key, required this.now, required this.memberName, required this.onTap});

  final DateTime now;
  final String? memberName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = memberName?.trim() ?? '';
    return _TintCard(
      label: 'Молимся сегодня',
      labelColor: const Color(0xFF3042A8),
      light: const [Color(0xFFEEF2FF), Color(0xFFE5EAFF)],
      dark: const Color(0xFF1B2040),
      border: const Color(0xFFBFC9F7),
      iconBg: const Color(0xFF4A5FD5),
      icon: Icons.church_outlined,
      titleColor: const Color(0xFF1A2560),
      title: todayPrayerLabel(now),
      subtitleColor: const Color(0xFF4A5FD5),
      subtitle: name.isEmpty ? 'Сегодня в цикле участник не назначен' : 'Молимся за $name',
      onTap: onTap,
      minHeight: 146,
    );
  }
}

/// «Мероприятия»: ближайшее мероприятие; тап открывает описание.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.onTap});

  final HomeEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _TintCard(
      label: 'Мероприятия',
      labelColor: const Color(0xFF0F6636),
      light: const [Color(0xFFEDFBF3), Color(0xFFD9F5E6)],
      dark: const Color(0xFF12281C),
      border: const Color(0xFFA8E4C0),
      iconBg: const Color(0xFF1A9A55),
      icon: Icons.calendar_month_outlined,
      titleColor: const Color(0xFF0A2E18),
      title: event.title,
      subtitleColor: const Color(0xFF1A9A55),
      subtitle: event.whenLabel,
      hint: event.isPlaceholder ? null : 'Нажмите, чтобы открыть описание.',
      hintColor: const Color(0xFF2F6D49),
      onTap: onTap,
    );
  }
}

/// «Медиа»: последняя проповедь и кнопка «Воспроизвести».
class MediaCard extends StatelessWidget {
  const MediaCard({super.key, required this.episode, required this.onPlay});

  final Episode? episode;
  final VoidCallback? onPlay;

  static const _teal = Color(0xFF0E7E6A);

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ep = episode;
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: _teal, borderRadius: BorderRadius.circular(Radii.sm)),
                child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 8),
              Text('Медиа', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: palette.isDark ? const Color(0xFF4FD0B6) : _teal)),
            ],
          ),
          const SizedBox(height: 14),
          if (ep == null)
            Text('Новая проповедь пока не найдена.', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: palette.inkMuted))
          else ...[
            Text(
              ep.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, height: 1.3, color: palette.ink),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 48,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: _teal,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                ),
                onPressed: onPlay,
                icon: const Icon(Icons.play_arrow_rounded, size: 20),
                label: const Text('Воспроизвести', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Компактная карточка трансляции: тёмная шапка, таймер и «Смотреть».
class BroadcastCard extends StatefulWidget {
  const BroadcastCard({super.key, required this.broadcast, required this.onOpen, DateTime Function()? clock}) : clock = clock ?? DateTime.now;

  final BroadcastInfo broadcast;
  final VoidCallback onOpen;
  final DateTime Function() clock;

  @override
  State<BroadcastCard> createState() => _BroadcastCardState();
}

class _BroadcastCardState extends State<BroadcastCard> {
  static const _red = Color(0xFFD64035);
  Timer? _timer;
  late DateTime _now = widget.clock();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = widget.clock());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final b = widget.broadcast;
    final mode = broadcastMode(_now, b);
    final onAir = mode == BroadcastMode.onAir;
    final end = b.startsAt?.add(broadcastSlot);
    final timerColor = onAir ? _red : palette.ink;
    Widget row(String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: palette.inkMuted)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: palette.ink, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ],
          ),
        );
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(Radii.card),
        border: Border.all(color: palette.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: const Color(0xFF1A1A1A),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 36,
                  decoration: BoxDecoration(color: const Color(0xFF111111), borderRadius: BorderRadius.circular(6)),
                  child: const Icon(Icons.play_arrow_rounded, color: Colors.white70, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        b.title.isEmpty ? 'Трансляция' : b.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, height: 1.25, color: Colors.white),
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 8,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _StatusBadge(onAir: onAir),
                          Text(broadcastPlatform(b.platform), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xB3FFFFFF))),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        onAir ? 'Идёт трансляция' : 'До начала',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: onAir ? _red : palette.inkMuted),
                      ),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          broadcastTimer(_now, b),
                          maxLines: 1,
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: timerColor, fontFeatures: const [FontFeature.tabularFigures()]),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: SizedBox(
                    height: 44,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: _red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
                      ),
                      onPressed: widget.onOpen,
                      child: const FittedBox(fit: BoxFit.scaleDown, child: Text('Смотреть', style: TextStyle(fontWeight: FontWeight.w800))),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: palette.hairline),
          const SizedBox(height: 6),
          row(onAir ? 'Началась' : 'Начало', broadcastDateTime(b.startsAt)),
          if (end != null) row('Окончание', broadcastDateTime(end)),
          row('Описание', b.description.isEmpty ? '—' : b.description),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.onAir});
  final bool onAir;

  @override
  Widget build(BuildContext context) {
    final bg = onAir ? const Color(0xFFD64035) : const Color(0xFFFEF3C7);
    final fg = onAir ? Colors.white : const Color(0xFFB45309);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onAir) ...[
            Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
            const SizedBox(width: 4),
          ],
          Text(onAir ? 'В эфире' : 'Скоро', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: fg)),
        ],
      ),
    );
  }
}
