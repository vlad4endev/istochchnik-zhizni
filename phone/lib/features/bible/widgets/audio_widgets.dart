import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../songbook/widgets/reader_palette.dart';
import '../../songbook/widgets/reader_settings_sheet.dart' show ReaderSwitch;
import '../audio/bible_audio_player.dart';
import '../bible_reader_controller.dart';
import '../logic/audio_logic.dart';

String rateLabel(double rate) => '${rate == rate.roundToDouble() ? rate.toInt().toString() : rate.toString().replaceAll('.', ',')}×';

/// Круглая кнопка play/pause; во время загрузки — крутится индикатор.
class _PlayButton extends StatelessWidget {
  const _PlayButton({required this.player, required this.palette, this.size = 44, this.onTap});

  final BiblePlayer player;
  final ReaderPalette palette;
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final loading = player.status == AudioStatus.loading;
    final playing = player.status == AudioStatus.playing;
    return Semantics(
      button: true,
      label: playing ? 'Пауза' : 'Слушать',
      excludeSemantics: true,
      child: Material(
        color: palette.accent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: loading ? null : (onTap ?? player.toggle),
          child: SizedBox(
            width: size,
            height: size,
            child: loading
                ? Padding(padding: EdgeInsets.all(size * 0.28), child: CircularProgressIndicator(strokeWidth: 2.4, color: palette.onAccent))
                : Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: size * 0.6, color: palette.onAccent),
          ),
        ),
      ),
    );
  }
}

/// «Слушать главу» над текстом: нажатие включает или ставит на паузу, шеврон открывает плеер.
/// Если для главы нет записи — не показывается.
class ChapterListenRow extends StatelessWidget {
  const ChapterListenRow({super.key, required this.controller, required this.pageIndex, required this.palette, required this.onOpenPlayer});

  final BibleReaderController controller;
  final int pageIndex;
  final ReaderPalette palette;
  final VoidCallback onOpenPlayer;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return FutureBuilder(
      future: c.audioAt(pageIndex),
      builder: (context, snapshot) {
        if (snapshot.data == null) return const SizedBox.shrink();
        return ListenableBuilder(
          listenable: c.audio,
          builder: (context, _) {
            final entry = c.index.at(pageIndex);
            final current = c.isPlayingPage(pageIndex);
            final playing = current && c.audio.playing;
            Future<void> tap() async {
              if (current) return c.audio.toggle();
              final ok = await c.listen(pageIndex: pageIndex);
              if (!ok && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Для этой главы нет озвучки')));
            }

            return Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
              decoration: BoxDecoration(color: palette.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: palette.border)),
              child: Row(
                children: [
                  _PlayButton(player: c.audio, palette: palette, onTap: current ? null : () => tap()),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Semantics(
                      button: true,
                      label: playing ? 'Пауза. ${entry.book.name} ${entry.chapter}' : 'Слушать главу ${entry.book.name} ${entry.chapter}',
                      excludeSemantics: true,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: tap,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 44),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(playing ? 'Сейчас играет' : 'Слушать главу', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: palette.text)),
                              Text('${entry.book.name} ${entry.chapter}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: palette.muted)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Открыть плеер',
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    onPressed: () async {
                      if (!current) await c.listen(pageIndex: pageIndex);
                      onOpenPlayer();
                    },
                    icon: Icon(Icons.chevron_right_rounded, color: palette.muted),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

/// Плашка над нижней панелью: что звучит, пауза, закрыть; нажатие открывает плеер.
class BibleMiniPlayer extends StatelessWidget {
  const BibleMiniPlayer({super.key, required this.player, required this.palette, required this.onOpen});

  final BiblePlayer player;
  final ReaderPalette palette;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final track = player.track;
        if (track == null) return const SizedBox.shrink();
        return Container(
          decoration: BoxDecoration(
            gradient: wineGradient,
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 16, offset: Offset(0, 6))],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ValueListenableBuilder<Duration>(
                valueListenable: player.position,
                builder: (context, position, _) {
                  final total = player.duration.inMilliseconds;
                  return LinearProgressIndicator(
                    value: total <= 0 ? 0 : (position.inMilliseconds / total).clamp(0.0, 1.0),
                    minHeight: 3,
                    backgroundColor: Colors.white24,
                    color: Colors.white,
                  );
                },
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        button: true,
                        label: 'Открыть плеер. Сейчас играет ${track.title}',
                        excludeSemantics: true,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: onOpen,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 48),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Colors.white)),
                                Text('${track.translationTitle} · озвучка', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xB3FFFFFF))),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: player.playing ? 'Пауза' : 'Слушать',
                      excludeSemantics: true,
                      child: Material(
                        color: Colors.white,
                        shape: const CircleBorder(),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: player.status == AudioStatus.loading ? null : player.toggle,
                          child: SizedBox(
                            width: 44,
                            height: 44,
                            child: player.status == AudioStatus.loading
                                ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2.4, color: ChurchColors.wine))
                                : Icon(player.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: ChurchColors.wine, size: 26),
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Остановить и закрыть',
                      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                      onPressed: player.close,
                      icon: const Icon(Icons.close_rounded, color: Color(0xB3FFFFFF)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Полный плеер: перемотка, ±15 с, скорость, автопереход и таймер сна.
Future<void> showBiblePlayerSheet(BuildContext context, {required BiblePlayer player, required ReaderPalette palette}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    builder: (context) => _PlayerSheet(player: player, palette: palette),
  );
}

class _PlayerSheet extends StatelessWidget {
  const _PlayerSheet({required this.player, required this.palette});

  final BiblePlayer player;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
      decoration: BoxDecoration(color: p.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(28)), border: Border(top: BorderSide(color: p.border))),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
          child: ListenableBuilder(
            listenable: player,
            builder: (context, _) {
              final track = player.track;
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: p.secondary.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(2)))),
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Semantics(
                            header: true,
                            child: Text(track?.title ?? 'Озвучка', maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: p.text)),
                          ),
                        ),
                        IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: Icon(Icons.close_rounded, color: p.muted)),
                      ],
                    ),
                  ),
                  if (track != null) Text('${track.translationTitle} · озвучка', style: TextStyle(fontSize: 13.5, color: p.muted)),
                  const SizedBox(height: 18),
                  ValueListenableBuilder<Duration>(
                    valueListenable: player.position,
                    builder: (context, position, _) {
                      final total = player.duration;
                      final max = total.inMilliseconds.toDouble();
                      final value = position.inMilliseconds.toDouble().clamp(0.0, max <= 0 ? 1.0 : max);
                      return Column(
                        children: [
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(activeTrackColor: p.accent, inactiveTrackColor: p.track, thumbColor: p.accent, overlayColor: p.accent.withValues(alpha: 0.15)),
                            child: Semantics(
                              label: 'Положение в записи',
                              value: '${formatAudioTime(position)} из ${formatAudioTime(total)}',
                              child: Slider(
                                min: 0,
                                max: max <= 0 ? 1 : max,
                                value: max <= 0 ? 0 : value,
                                onChanged: max <= 0 ? null : (v) => player.seek(Duration(milliseconds: v.round())),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(formatAudioTime(position), style: TextStyle(fontSize: 12.5, color: p.muted)),
                                Text(formatAudioTime(total), style: TextStyle(fontSize: 12.5, color: p.muted)),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _RoundIcon(icon: Icons.replay_rounded, label: 'Назад на 15 секунд', palette: p, onTap: () => player.skipBy(const Duration(seconds: -15))),
                      const SizedBox(width: 22),
                      _PlayButton(player: player, palette: p, size: 68),
                      const SizedBox(width: 22),
                      _RoundIcon(icon: Icons.forward_rounded, label: 'Вперёд на 15 секунд', palette: p, onTap: () => player.skipBy(const Duration(seconds: 15))),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Semantics(
                        button: true,
                        label: 'Скорость воспроизведения ${rateLabel(player.rate)}. Нажмите, чтобы сменить',
                        excludeSemantics: true,
                        child: Material(
                          color: p.surface,
                          borderRadius: BorderRadius.circular(14),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: player.cycleRate,
                            child: Container(
                              constraints: const BoxConstraints(minWidth: 72, minHeight: 44),
                              padding: const EdgeInsets.symmetric(horizontal: 14),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: p.border)),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.speed_rounded, size: 18, color: p.accent),
                                  const SizedBox(width: 6),
                                  Text(rateLabel(player.rate), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.text)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: Text('Включать следующую главу', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: p.text))),
                      ReaderSwitch(value: player.autoNext, onChanged: player.setAutoNext, palette: p, label: 'Автоматически включать следующую главу'),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _SleepTimer(player: player, palette: p),
                  const SizedBox(height: 14),
                  Text('Озвучка: wordproject.org', style: TextStyle(fontSize: 11.5, color: p.muted)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.icon, required this.label, required this.palette, required this.onTap});

  final IconData icon;
  final String label;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: Material(
            color: palette.surface,
            shape: CircleBorder(side: BorderSide(color: palette.border)),
            clipBehavior: Clip.antiAlias,
            child: InkWell(onTap: onTap, child: SizedBox(width: 52, height: 52, child: Icon(icon, size: 26, color: palette.text))),
          ),
        ),
      );
}

class _SleepTimer extends StatefulWidget {
  const _SleepTimer({required this.player, required this.palette});

  final BiblePlayer player;
  final ReaderPalette palette;

  @override
  State<_SleepTimer> createState() => _SleepTimerState();
}

class _SleepTimerState extends State<_SleepTimer> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Оставшееся время обновляется раз в секунду, пока таймер идёт.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && widget.player.sleepKind == SleepKind.minutes) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    final player = widget.player;
    final kind = player.sleepKind;
    final suffix = switch (kind) {
      SleepKind.minutes => ' · ${formatAudioTime(player.sleepLeft)}',
      SleepKind.chapterEnd => ' · до конца главы',
      SleepKind.off => '',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.bedtime_outlined, size: 17, color: p.accent),
            const SizedBox(width: 6),
            Expanded(child: Text('Таймер сна$suffix', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.muted))),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _Chip(label: 'Выкл', selected: kind == SleepKind.off, palette: p, onTap: player.sleepOff),
            for (final m in sleepMinutes) _Chip(label: '$m мин', selected: kind == SleepKind.minutes && player.sleepLeft > Duration.zero && _isMinutes(m), palette: p, onTap: () => player.sleepInMinutes(m)),
            _Chip(label: 'До конца главы', selected: kind == SleepKind.chapterEnd, palette: p, onTap: player.sleepAtChapterEnd),
          ],
        ),
      ],
    );
  }

  /// Подсвечиваем выбранный интервал: оставшееся время ближе всего к нему.
  bool _isMinutes(int m) {
    final left = widget.player.sleepLeft.inSeconds;
    final candidates = sleepMinutes.where((x) => x * 60 >= left - 1);
    return candidates.isNotEmpty && candidates.first == m;
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.palette, required this.onTap});

  final String label;
  final bool selected;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: Material(
          color: selected ? palette.accent : palette.surface,
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 44, minWidth: 56),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), border: Border.all(color: selected ? palette.accent : palette.border)),
              child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: selected ? palette.onAccent : palette.text)),
            ),
          ),
        ),
      );
}
