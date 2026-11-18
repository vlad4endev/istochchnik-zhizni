import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/dates.dart';
import '../../core/plural.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../studio/studio_page.dart';
import 'data/songbook_repository.dart';
import 'logic/song_search.dart';
import 'models/song.dart';
import 'song_reader_page.dart';
import 'songbook_controller.dart';
import 'widgets/alpha_index.dart';
import 'widgets/song_filter_sheet.dart';
import 'widgets/song_row.dart';
import 'widgets/toggle_chip.dart';

class SongbookPage extends StatefulWidget {
  const SongbookPage({super.key, this.source});

  /// Подмена источника песен — для проверок без сети.
  final SongbookSource? source;

  @override
  State<SongbookPage> createState() => _SongbookPageState();
}

class _SongbookPageState extends State<SongbookPage> {
  late final SongbookSource _source = widget.source ?? SongbookRepository(context.read<SessionController>());
  late final SongbookController _c = SongbookController(_source);
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _scroll = ScrollController();
  final Map<String, GlobalKey> _groupKeys = {};

  @override
  void initState() {
    super.initState();
    _c.addListener(_syncSearchText);
    _c.load();
  }

  @override
  void dispose() {
    _c.removeListener(_syncSearchText);
    _c.dispose();
    _search.dispose();
    _searchFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// «Сбросить поиск» очищает и само поле.
  void _syncSearchText() {
    if (_c.query != _search.text) _search.text = _c.query;
  }

  bool get _studio => context.read<SessionController>().canOpen('studio');

  Future<void> _open(Song song) async {
    _searchFocus.unfocus();
    final current = _c.current(song);
    await pushPage(
      context,
      SongReaderPage(
        song: current,
        songbook: _c,
        source: _source,
        useMyVersion: current.hasStudioVersion && _studio,
      ),
    );
  }

  Future<void> _favorite(Song song) async {
    final error = await _c.toggleFavorite(song);
    if (error != null && mounted) showMessage(context, error);
  }

  Future<void> _jumpToLetter(String letter) async {
    final letters = [for (final g in _c.groups) g.letter];
    for (var attempt = 0; attempt < 4 && _scroll.hasClients; attempt++) {
      final context = _groupKeys[letter]?.currentContext;
      if (context != null && context.mounted) {
        await Scrollable.ensureVisible(context, alignment: 0, duration: Duration.zero);
        return;
      }
      // Заголовок ещё не построен: прыгаем примерно и пробуем снова.
      final max = _scroll.position.maxScrollExtent;
      final i = letters.indexOf(letter);
      if (i < 0) return;
      _scroll.jumpTo((max * i / letters.length).clamp(0, max));
      await WidgetsBinding.instance.endOfFrame;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        return ChurchPage(
          title: 'Песенник',
          subtitle: _c.hasSongs ? 'Тексты и аккорды · ${countSongs(_c.total)}' : 'Тексты и аккорды',
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 0),
                child: Row(
                  children: [
                    Expanded(child: _SearchField(controller: _search, focus: _searchFocus, onChanged: _c.setQuery)),
                    const SizedBox(width: 8),
                    _FilterButton(count: _c.filters.activeCount, onTap: () => showSongFilters(context, _c)),
                  ],
                ),
              ),
              if (_c.hasSongs) _Chips(controller: _c),
              if (_c.hasSongs) _SubHeader(controller: _c, studio: _studio),
              if (_c.staleSince != null && _c.hasSongs) _StaleNotice(since: _c.staleSince!, onRetry: _c.refresh, refreshing: _c.refreshing),
              Expanded(child: _content()),
            ],
          ),
        );
      },
    );
  }

  Widget _content() {
    if (_c.loading && !_c.hasSongs) return const LoadingView();
    if (!_c.hasSongs) {
      if (_c.error != null) return ErrorView(message: _c.error!, onRetry: _c.refresh);
      return const EmptyHint('В песеннике пока нет песен', icon: Icons.library_music_outlined, hint: 'Песни добавляют на сайте, в разделе «Песенник».');
    }
    if (_c.searching) {
      if (_c.hits.isEmpty) return _noResults();
      return _hits();
    }
    if (_c.shownCount == 0) return _noResults();
    return _sorted();
  }

  Widget _noResults() {
    final palette = context.palette;
    if (_c.searching) {
      return ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          EmptyHint(
            'Ничего не найдено',
            icon: Icons.search_off_rounded,
            hint: 'Проверьте написание — или поищите по строчке из песни, номеру или тональности.',
            action: Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                SecondaryButton(label: 'Сбросить поиск', expand: false, onPressed: () => _c.setQuery('')),
                if (!_c.filters.isEmpty) SecondaryButton(label: 'Сбросить фильтры', expand: false, onPressed: _c.clearFilters),
              ],
            ),
          ),
        ],
      );
    }
    final onlyFavorites = _c.filters.favoritesOnly && _c.filters.activeCount == 0;
    return ListView(
      children: [
        EmptyHint(
          onlyFavorites ? 'В избранном пока пусто' : 'Нет песен с такими фильтрами',
          icon: onlyFavorites ? Icons.favorite_border_rounded : Icons.filter_alt_off_outlined,
          hint: onlyFavorites ? 'Нажмите сердечко у песни — и она всегда будет под рукой.' : 'Попробуйте убрать часть условий.',
          action: PrimaryButton(
            label: onlyFavorites ? 'Показать все песни' : 'Сбросить фильтры',
            height: 48,
            expand: false,
            onPressed: _c.clearFilters,
          ),
        ),
        SizedBox(height: palette.isDark ? 0 : 0),
      ],
    );
  }

  Widget _hits() {
    final palette = context.palette;
    return RefreshIndicator(
      color: palette.accent,
      onRefresh: _c.refresh,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(Space.lg, 4, Space.lg, 32 + MediaQuery.paddingOf(context).bottom),
        children: [
          ListGroup(
            dividerIndent: 14,
            children: [
              for (final hit in _c.hits)
                SongRow(
                  song: _c.current(hit.song),
                  titleMarks: hit.titleMarks,
                  tagMarks: hit.tagMarks,
                  snippet: hit.snippet,
                  onTap: () => _open(hit.song),
                  onFavorite: () => _favorite(hit.song),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sorted() {
    final palette = context.palette;
    final bottom = 32 + MediaQuery.paddingOf(context).bottom;
    if (_c.sort == SongSort.number) {
      return RefreshIndicator(
        color: palette.accent,
        onRefresh: _c.refresh,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(Space.lg, 4, Space.lg, bottom),
          children: [
            ListGroup(
              dividerIndent: 56,
              children: [
                for (final s in _c.flat)
                  SongRow(song: s, showNumberColumn: true, onTap: () => _open(s), onFavorite: () => _favorite(s)),
              ],
            ),
          ],
        ),
      );
    }

    final groups = _c.groups;
    final showIndex = _c.shownCount >= 12 && groups.length >= 4;
    _groupKeys.removeWhere((letter, _) => !groups.any((g) => g.letter == letter));
    return Stack(
      children: [
        RefreshIndicator(
          color: palette.accent,
          onRefresh: _c.refresh,
          child: CustomScrollView(
            controller: _scroll,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              for (final group in groups)
                SliverMainAxisGroup(
                  slivers: [
                    SliverPersistentHeader(
                      pinned: true,
                      delegate: _LetterHeader(
                        key: _groupKeys.putIfAbsent(group.letter, GlobalKey.new),
                        letter: group.letter,
                        background: palette.sheet,
                        color: palette.accent,
                      ),
                    ),
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(Space.lg, 0, showIndex ? 34 : Space.lg, 4),
                      sliver: SliverToBoxAdapter(
                        child: ListGroup(
                          dividerIndent: 14,
                          children: [
                            for (final s in group.songs) SongRow(song: s, onTap: () => _open(s), onFavorite: () => _favorite(s)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              SliverToBoxAdapter(child: SizedBox(height: bottom)),
            ],
          ),
        ),
        if (showIndex)
          Positioned(
            right: 4,
            top: 12,
            bottom: 24,
            child: AlphaIndex(letters: [for (final g in groups) g.letter], onSelect: _jumpToLetter),
          ),
      ],
    );
  }
}

/// Буква-заголовок: залипает вверху, пока листаем её песни.
class _LetterHeader extends SliverPersistentHeaderDelegate {
  _LetterHeader({required this.key, required this.letter, required this.background, required this.color});

  final Key key;
  final String letter;
  final Color background;
  final Color color;

  static const _height = 36.0;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return KeyedSubtree(
      key: key,
      child: Container(
        height: _height,
        color: background,
        padding: const EdgeInsets.fromLTRB(Space.lg + 6, 0, Space.lg, 0),
        alignment: Alignment.centerLeft,
        child: Semantics(header: true, child: Text(letter, style: ChurchType.sectionLabel.copyWith(color: color, fontSize: 13))),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _LetterHeader old) => old.letter != letter || old.background != background || old.color != color;
}

// ================================================================ верхняя часть

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.focus, required this.onChanged});

  final TextEditingController controller;
  final FocusNode focus;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) => TextField(
        controller: controller,
        focusNode: focus,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => focus.unfocus(),
        enableSuggestions: false,
        style: TextStyle(fontSize: 15.5, color: palette.ink),
        decoration: InputDecoration(
          hintText: 'Название, текст, номер или тег',
          prefixIcon: Icon(Icons.search_rounded, color: palette.inkMuted),
          suffixIcon: value.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Очистить поиск',
                  icon: Icon(Icons.close_rounded, color: palette.inkMuted),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final active = count > 0;
    return Semantics(
      button: true,
      label: active ? 'Фильтры, включено: $count' : 'Фильтры',
      excludeSemantics: true,
      child: Material(
        color: active ? palette.accentSoft : palette.card,
        borderRadius: BorderRadius.circular(Radii.lg),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Radii.lg),
              border: Border.all(color: active ? palette.accent : palette.hairline, width: active ? 1.4 : 1),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(Icons.tune_rounded, color: active ? palette.accent : palette.inkMuted),
                if (active)
                  Positioned(
                    top: 7,
                    right: 7,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: ChurchColors.wine, shape: BoxShape.circle),
                      child: Text('$count', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Colors.white, height: 1.1)),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({required this.controller});
  final SongbookController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final f = c.filters;
    final topTags = c.tags.take(8).toList();
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 4),
        children: [
          ToggleChip(label: 'Все', count: c.total, selected: f.isEmpty, onTap: c.clearFilters),
          const SizedBox(width: 8),
          ToggleChip(
            label: 'Избранное',
            icon: Icons.favorite_rounded,
            count: c.favoriteCount,
            selected: f.favoritesOnly,
            onTap: c.toggleFavoritesOnly,
          ),
          for (final t in topTags) ...[
            const SizedBox(width: 8),
            ToggleChip(label: t.name, selected: f.tags.contains(t.name), onTap: () => c.toggleTag(t.name)),
          ],
        ],
      ),
    );
  }
}

class _SubHeader extends StatelessWidget {
  const _SubHeader({required this.controller, required this.studio});

  final SongbookController controller;
  final bool studio;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final palette = context.palette;
    final muted = TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.inkMuted);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg + 2, 0, Space.sm, 0),
      child: Row(
        children: [
          Expanded(
            child: c.searching
                ? Semantics(liveRegion: true, child: Text('Найдено: ${c.shownCount}', style: muted))
                : _SortMenu(controller: c),
          ),
          if (studio)
            TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size(44, 44), padding: const EdgeInsets.symmetric(horizontal: 10)),
              onPressed: () => pushPage(context, const StudioPage()),
              icon: const Icon(Icons.queue_music_rounded, size: 18),
              label: const Text('Сетлисты'),
            ),
        ],
      ),
    );
  }
}

class _SortMenu extends StatelessWidget {
  const _SortMenu({required this.controller});
  final SongbookController controller;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final byNumber = controller.sort == SongSort.number;
    return Align(
      alignment: Alignment.centerLeft,
      child: PopupMenuButton<SongSort>(
        tooltip: 'Порядок песен',
        initialValue: controller.sort,
        onSelected: controller.setSort,
        color: palette.card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        itemBuilder: (context) => [
          for (final (value, label) in const [(SongSort.alphabetical, 'По алфавиту'), (SongSort.number, 'По номеру')])
            CheckedPopupMenuItem<SongSort>(value: value, checked: controller.sort == value, child: Text(label)),
        ],
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(byNumber ? Icons.format_list_numbered_rounded : Icons.sort_by_alpha_rounded, size: 18, color: palette.inkMuted),
              const SizedBox(width: 6),
              Text(byNumber ? 'По номеру' : 'По алфавиту', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.inkMuted)),
              Icon(Icons.arrow_drop_down_rounded, color: palette.inkMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _StaleNotice extends StatelessWidget {
  const _StaleNotice({required this.since, required this.onRetry, required this.refreshing});

  final DateTime since;
  final VoidCallback onRetry;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg, 4, Space.lg, 6),
      child: Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
          decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(Radii.md)),
          child: Row(
            children: [
              Icon(Icons.cloud_off_rounded, size: 18, color: palette.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Нет связи — песни сохранены ${relativeTime(since.toIso8601String())}',
                  style: TextStyle(fontSize: 12.5, height: 1.3, color: palette.ink),
                ),
              ),
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                onPressed: refreshing ? null : onRetry,
                child: Text(refreshing ? '…' : 'Обновить'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
