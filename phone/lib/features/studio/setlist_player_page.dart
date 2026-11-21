import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../songbook/models/song.dart';
import '../songbook/song_reader_page.dart';
import '../songbook/widgets/reader_palette.dart';
import 'models/studio_models.dart';
import 'widgets/musician_notes_card.dart';

/// Режим выступления: песни сетлиста одна за другой, листаются свайпом или кнопками внизу.
/// В каждой песне работают транспонирование, каподастр, размер шрифта и автопрокрутка, как в песеннике.
class SetlistPlayerPage extends StatefulWidget {
  const SetlistPlayerPage({super.key, required this.items, this.start = 0});

  final List<SetlistItem> items;
  final int start;

  @override
  State<SetlistPlayerPage> createState() => _SetlistPlayerPageState();
}

class _SetlistPlayerPageState extends State<SetlistPlayerPage> {
  late final PageController _pages = PageController(initialPage: widget.start.clamp(0, widget.items.length - 1));
  late final ValueNotifier<int> _index = ValueNotifier(widget.start.clamp(0, widget.items.length - 1));

  @override
  void initState() {
    super.initState();
    // На сцене экран не должен гаснуть, пока играет весь сетлист.
    unawaited(_wake(true));
  }

  @override
  void dispose() {
    unawaited(_wake(false));
    _pages.dispose();
    _index.dispose();
    super.dispose();
  }

  Future<void> _wake(bool on) async {
    try {
      await WakelockPlus.toggle(enable: on);
    } catch (_) {}
  }

  void _go(int page) {
    if (page < 0 || page >= widget.items.length || !_pages.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _pages.jumpToPage(page);
    } else {
      _pages.animateToPage(page, duration: const Duration(milliseconds: 240), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    return PageView.builder(
      controller: _pages,
      itemCount: items.length,
      onPageChanged: (i) => _index.value = i,
      itemBuilder: (context, i) {
        final item = items[i];
        return SongReaderPage(
          key: ValueKey('player-${item.id}'),
          song: Song.adHoc(title: item.title, content: item.content, key: item.key),
          manageWakelock: false,
          afterTextBuilder: (context, palette) => MusicianNotesCard(item: item, palette: palette),
          footerBuilder: (context, palette) => _PlayerBar(
            palette: palette,
            items: items,
            index: i,
            onPrev: () => _go(i - 1),
            onNext: () => _go(i + 1),
          ),
        );
      },
    );
  }
}

class _PlayerBar extends StatelessWidget {
  const _PlayerBar({required this.palette, required this.items, required this.index, required this.onPrev, required this.onNext});

  final ReaderPalette palette;
  final List<SetlistItem> items;
  final int index;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final next = index + 1 < items.length ? items[index + 1] : null;
    return Container(
      decoration: BoxDecoration(color: palette.sheet, border: Border(top: BorderSide(color: palette.border))),
      padding: EdgeInsets.fromLTRB(8, 4, 8, 4 + MediaQuery.paddingOf(context).bottom),
      child: Row(
        children: [
          _Arrow(icon: Icons.chevron_left_rounded, label: 'Предыдущая песня', palette: palette, onTap: index > 0 ? onPrev : null),
          Expanded(
            child: Semantics(
              liveRegion: true,
              label: 'Песня ${index + 1} из ${items.length}${next == null ? '. Последняя песня' : '. Дальше: ${next.title}'}',
              excludeSemantics: true,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Песня ${index + 1} из ${items.length}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: palette.text)),
                  Text(
                    next == null ? 'Последняя в сетлисте' : 'Дальше: ${next.title}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: palette.muted),
                  ),
                ],
              ),
            ),
          ),
          _Arrow(icon: Icons.chevron_right_rounded, label: 'Следующая песня', palette: palette, onTap: next == null ? null : onNext),
        ],
      ),
    );
  }
}

class _Arrow extends StatelessWidget {
  const _Arrow({required this.icon, required this.label, required this.palette, required this.onTap});
  final IconData icon;
  final String label;
  final ReaderPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: Semantics(
          button: true,
          enabled: onTap != null,
          label: label,
          excludeSemantics: true,
          child: Opacity(
            opacity: onTap == null ? 0.3 : 1,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: onTap,
              child: SizedBox(width: 56, height: 56, child: Icon(icon, size: 30, color: palette.text)),
            ),
          ),
        ),
      );
}
