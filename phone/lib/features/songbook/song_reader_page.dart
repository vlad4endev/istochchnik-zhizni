import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../ui/widgets.dart';
import 'data/songbook_repository.dart';
import 'logic/song_format.dart';
import 'models/song.dart';
import 'reader_controller.dart';
import 'songbook_controller.dart';
import 'widgets/reader_palette.dart';
import 'widgets/reader_settings_sheet.dart';
import 'widgets/song_text.dart';

/// Читалка песни: аккорды над слогами, тональность, каподастр, автопрокрутка.
class SongReaderPage extends StatefulWidget {
  const SongReaderPage({super.key, required this.song, this.songbook, this.source, this.useMyVersion = false});

  final Song song;

  /// Нужен для сердечка «Избранное»; у песни из сетлиста его нет.
  final SongbookController? songbook;
  final SongbookSource? source;

  /// Показать мою версию из студии, если она есть.
  final bool useMyVersion;

  @override
  State<SongReaderPage> createState() => _SongReaderPageState();
}

class _SongReaderPageState extends State<SongReaderPage> with SingleTickerProviderStateMixin {
  late final ReaderController _c = ReaderController(song: widget.song, source: widget.source);
  final ScrollController _scroll = ScrollController();
  late final Ticker _ticker = createTicker(_onTick);
  Duration _lastTick = Duration.zero;
  bool _scrolling = false;
  bool? _awake;

  @override
  void initState() {
    super.initState();
    _c.addListener(_syncAwake);
    unawaited(_c.init().then((_) => _syncAwake()));
    if (widget.song.inCatalog) unawaited(widget.source?.recordOpened(widget.song.id));
    if (widget.useMyVersion) unawaited(_c.loadMyVersion());
  }

  @override
  void dispose() {
    _ticker.dispose();
    _scroll.dispose();
    _c.removeListener(_syncAwake);
    _c.dispose();
    unawaited(_setAwake(false));
    super.dispose();
  }

  // ------------------------------------------------------------ экран не гаснет

  void _syncAwake() => unawaited(_setAwake(_c.settings.keepAwake));

  Future<void> _setAwake(bool value) async {
    if (_awake == value) return;
    _awake = value;
    try {
      await WakelockPlus.toggle(enable: value);
    } catch (_) {
      /* на устройстве без поддержки экран просто гаснет по таймеру */
    }
  }

  // ------------------------------------------------------------ автопрокрутка

  /// Скорость в пикселях в секунду: чем крупнее шрифт, тем быстрее, чтобы темп чтения был тот же.
  double get _pixelsPerSecond => const [9, 16, 25, 38, 55][_c.settings.scrollSpeed - 1] * (_c.settings.fontSize / 22);

  void _onTick(Duration elapsed) {
    final dt = (elapsed - _lastTick).inMicroseconds / 1e6;
    _lastTick = elapsed;
    if (!_scroll.hasClients) return;
    final position = _scroll.position;
    final next = position.pixels + _pixelsPerSecond * dt;
    if (next >= position.maxScrollExtent) {
      _scroll.jumpTo(position.maxScrollExtent);
      _stopScroll();
      return;
    }
    _scroll.jumpTo(next);
  }

  void _startScroll() {
    if (!_scroll.hasClients || _scroll.position.maxScrollExtent <= 0) return;
    // Дошли до конца — начинаем сначала.
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 2) _scroll.jumpTo(0);
    _lastTick = Duration.zero;
    setState(() => _scrolling = true);
    _ticker.start();
  }

  void _stopScroll() {
    if (_ticker.isActive) _ticker.stop();
    if (_scrolling && mounted) setState(() => _scrolling = false);
  }

  // ------------------------------------------------------------ действия

  Future<void> _toggleFavorite() async {
    final error = await widget.songbook?.toggleFavorite(widget.song);
    if (error != null && mounted) showMessage(context, error);
  }

  String _subtitle() {
    final s = widget.song;
    return [
      if (s.number != null) '№${s.number}',
      if (s.tempo != null) '${s.tempo} BPM',
      if (s.timeSignature != null) s.timeSignature!,
      if (_c.capo > 0) 'капо ${_c.capo}',
      if (_c.usingMyVersion) 'моя версия',
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final p = ReaderPalette.of(_c.settings.theme);
        final List<SongBlock> blocks = _c.ready ? _c.blocks : const [];
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: p.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
          child: Scaffold(
            backgroundColor: p.bg,
            body: Column(
              children: [
                _Header(
                  controller: _c,
                  palette: p,
                  title: widget.song.title,
                  subtitle: _subtitle(),
                  songbook: widget.songbook,
                  song: widget.song,
                  onFavorite: _toggleFavorite,
                ),
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        // Касание останавливает прокрутку, как в любом читалке.
                        child: Listener(
                          onPointerDown: (_) {
                            if (_scrolling) _stopScroll();
                          },
                          child: blocks.isEmpty && _c.ready
                              ? _EmptySong(palette: p)
                              : SongText(
                                  blocks: blocks,
                                  palette: p,
                                  fontSize: _c.settings.fontSize,
                                  showChords: _c.settings.showChords,
                                  controller: _scroll,
                                ),
                        ),
                      ),
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 18 + MediaQuery.paddingOf(context).bottom,
                        child: _BottomBar(
                          controller: _c,
                          palette: p,
                          scrolling: _scrolling,
                          onStartScroll: _startScroll,
                          onStopScroll: _stopScroll,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _EmptySong extends StatelessWidget {
  const _EmptySong({required this.palette});
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.music_off_outlined, size: 44, color: palette.muted),
              const SizedBox(height: 14),
              Text('Текст песни ещё не добавлен', textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: palette.text)),
              const SizedBox(height: 6),
              Text('Его можно добавить на сайте в разделе «Песенник».', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, height: 1.4, color: palette.muted)),
            ],
          ),
        ),
      );
}

// ================================================================ шапка

class _Header extends StatelessWidget {
  const _Header({
    required this.controller,
    required this.palette,
    required this.title,
    required this.subtitle,
    required this.songbook,
    required this.song,
    required this.onFavorite,
  });

  final ReaderController controller;
  final ReaderPalette palette;
  final String title;
  final String subtitle;
  final SongbookController? songbook;
  final Song song;
  final VoidCallback onFavorite;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final key = c.soundingKey;
    final t = c.transpose;
    final badge = key ?? (t == 0 ? null : '${t > 0 ? '+' : ''}$t');
    return Container(
      decoration: BoxDecoration(color: palette.bg, border: Border(bottom: BorderSide(color: palette.border))),
      padding: EdgeInsets.fromLTRB(12, MediaQuery.paddingOf(context).top + 6, 12, 8),
      child: Row(
        children: [
          _IconBox(icon: Icons.chevron_left_rounded, label: 'Назад', palette: palette, onTap: () => Navigator.of(context).maybePop()),
          const SizedBox(width: 10),
          Expanded(
            child: Semantics(
              header: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.19, height: 1.15, color: palette.text),
                  ),
                  if (subtitle.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: palette.muted)),
                    ),
                ],
              ),
            ),
          ),
          if (badge != null) ...[
            const SizedBox(width: 8),
            _KeyBadge(label: badge, shifted: t != 0, palette: palette, onTap: key == null ? null : () => showKeyPicker(context, c)),
          ],
          if (song.inCatalog && songbook != null) ...[
            const SizedBox(width: 8),
            ListenableBuilder(
              listenable: songbook!,
              builder: (context, _) {
                final fav = songbook!.current(song).favorite;
                return _IconBox(
                  icon: fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  label: fav ? 'Убрать из избранного' : 'Добавить в избранное',
                  palette: palette,
                  color: fav ? const Color(0xFFFF5C7A) : null,
                  onTap: onFavorite,
                );
              },
            ),
          ],
          const SizedBox(width: 8),
          _IconBox(icon: Icons.tune_rounded, label: 'Настройки песни', palette: palette, onTap: () => showReaderSettings(context, c)),
        ],
      ),
    );
  }
}

class _IconBox extends StatelessWidget {
  const _IconBox({required this.icon, required this.label, required this.palette, required this.onTap, this.color});

  final IconData icon;
  final String label;
  final ReaderPalette palette;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: Material(
          color: palette.surface,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: palette.border)),
              child: Icon(icon, size: 22, color: color ?? palette.text),
            ),
          ),
        ),
      ),
    );
  }
}

class _KeyBadge extends StatelessWidget {
  const _KeyBadge({required this.label, required this.shifted, required this.palette, required this.onTap});

  final String label;
  final bool shifted;
  final ReaderPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: shifted ? 'Тональность $label, изменена. Выбрать тональность' : 'Тональность $label. Выбрать тональность',
      excludeSemantics: true,
      child: Material(
        color: palette.badge,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.accent.withValues(alpha: shifted ? 0.8 : 0.25), width: shifted ? 1.4 : 1),
            ),
            child: Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: palette.accent)),
          ),
        ),
      ),
    );
  }
}

// ================================================================ нижняя панель

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.controller,
    required this.palette,
    required this.scrolling,
    required this.onStartScroll,
    required this.onStopScroll,
  });

  final ReaderController controller;
  final ReaderPalette palette;
  final bool scrolling;
  final VoidCallback onStartScroll;
  final VoidCallback onStopScroll;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final p = palette;
    final compact = MediaQuery.sizeOf(context).width < 380;
    final cell = compact ? 36.0 : 40.0;
    final key = c.soundingKey;
    final t = c.transpose;
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.2,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: p.surface.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: p.border.withValues(alpha: 0.14)),
          boxShadow: const [BoxShadow(color: Color(0x99000000), offset: Offset(0, 16), blurRadius: 40, spreadRadius: -8)],
        ),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 160),
          child: scrolling
              ? _ScrollControls(key: const ValueKey('scroll'), controller: c, palette: p, cell: cell, onStop: onStopScroll)
              : Row(
                  key: const ValueKey('normal'),
                  children: [
                    if (c.hasChords) ...[
                      _Group(
                        palette: p,
                        children: [
                          _BarButton(symbol: '−', label: 'На полтона ниже', cell: cell, palette: p, onTap: t > -11 ? () => c.changeTranspose(-1) : null),
                          Semantics(
                            label: key == null ? 'Сдвиг $t' : 'Тональность $key',
                            excludeSemantics: true,
                            child: ConstrainedBox(
                              constraints: BoxConstraints(minWidth: compact ? 36 : 44),
                              child: Text(
                                key ?? (t == 0 ? '0' : '${t > 0 ? '+' : ''}$t'),
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.accent),
                              ),
                            ),
                          ),
                          _BarButton(symbol: '+', label: 'На полтона выше', cell: cell, palette: p, onTap: t < 11 ? () => c.changeTranspose(1) : null),
                        ],
                      ),
                      const SizedBox(width: 8),
                    ],
                    _Group(
                      palette: p,
                      children: [
                        _BarButton(symbol: 'A−', label: 'Уменьшить шрифт', cell: cell, palette: p, small: true, onTap: c.settings.fontSize > ReaderSettings.minFont ? () => c.bumpFont(-2) : null),
                        _BarButton(symbol: 'A+', label: 'Увеличить шрифт', cell: cell, palette: p, strong: true, onTap: c.settings.fontSize < ReaderSettings.maxFont ? () => c.bumpFont(2) : null),
                      ],
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Semantics(
                        button: true,
                        label: 'Автопрокрутка',
                        excludeSemantics: true,
                        child: Material(
                          color: p.accent,
                          borderRadius: BorderRadius.circular(15),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: onStartScroll,
                            child: SizedBox(
                              height: cell + 6,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.play_arrow_rounded, size: 20, color: p.onAccent),
                                  const SizedBox(width: 2),
                                  Flexible(
                                    child: Text('Скролл', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.onAccent)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.palette, required this.children});
  final ReaderPalette palette;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(color: palette.bg, borderRadius: BorderRadius.circular(15)),
        child: Row(mainAxisSize: MainAxisSize.min, children: children),
      );
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.symbol, required this.label, required this.cell, required this.palette, required this.onTap, this.small = false, this.strong = false});

  final String symbol;
  final String label;
  final double cell;
  final ReaderPalette palette;
  final VoidCallback? onTap;
  final bool small;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final isMath = symbol == '−' || symbol == '+';
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onTap == null ? 0.35 : 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: SizedBox(
            width: cell,
            height: cell,
            child: Center(
              child: Text(
                symbol,
                style: TextStyle(
                  fontSize: isMath ? 22 : (small ? 13 : 17),
                  fontWeight: isMath ? FontWeight.w600 : FontWeight.w700,
                  color: small ? palette.muted : palette.text,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScrollControls extends StatelessWidget {
  const _ScrollControls({super.key, required this.controller, required this.palette, required this.cell, required this.onStop});

  final ReaderController controller;
  final ReaderPalette palette;
  final double cell;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final p = palette;
    final speed = c.settings.scrollSpeed;
    return Row(
      children: [
        _Group(
          palette: p,
          children: [
            _BarButton(symbol: '−', label: 'Медленнее', cell: cell, palette: p, onTap: speed > 1 ? () => c.setScrollSpeed(speed - 1) : null),
            Semantics(
              label: 'Скорость $speed из ${ReaderSettings.speeds}',
              excludeSemantics: true,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 52),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$speed', textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: p.accent, height: 1.1)),
                    Text('скорость', textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, color: p.muted, height: 1.1)),
                  ],
                ),
              ),
            ),
            _BarButton(symbol: '+', label: 'Быстрее', cell: cell, palette: p, onTap: speed < ReaderSettings.speeds ? () => c.setScrollSpeed(speed + 1) : null),
          ],
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Semantics(
            button: true,
            label: 'Остановить прокрутку',
            excludeSemantics: true,
            child: Material(
              color: p.accent,
              borderRadius: BorderRadius.circular(15),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onStop,
                child: SizedBox(
                  height: cell + 6,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.pause_rounded, size: 20, color: p.onAccent),
                      const SizedBox(width: 2),
                      Flexible(child: Text('Пауза', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.onAccent))),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
