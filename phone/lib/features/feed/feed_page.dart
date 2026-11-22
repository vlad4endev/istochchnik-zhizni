import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'compose_page.dart';
import 'data/feed_source.dart';
import 'feed_controller.dart';
import 'logic/story_logic.dart';
import 'models/feed_models.dart';
import 'story_viewer.dart';
import 'widgets/comments_sheet.dart';
import 'widgets/likers_sheet.dart';
import 'widgets/post_card.dart';
import 'widgets/stories_bar.dart';

/// Раздел «Лента»: истории, записи общины с бесконечной прокруткой, порядок «Для вас / Новые»,
/// баннер новых записей, лайки, комментарии, репосты.
class FeedPage extends StatefulWidget {
  const FeedPage({super.key, this.source, this.checkInterval = const Duration(seconds: 45), this.mediaPicker});

  /// Для тестов; в приложении берётся из сессии.
  final FeedSource? source;
  final Duration checkInterval;
  final FeedMediaPicker? mediaPicker;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> with WidgetsBindingObserver {
  late final FeedSource _source;
  late final FeedController _c;
  final _scroll = ScrollController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _source = widget.source ?? FeedApi(session);
    _c = FeedController(_source, meId: session.user?.id ?? 0, cacheChanges: session.cache.changes)..load();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addObserver(this);
    // Пока раздел открыт, раз в минуту спрашиваем, нет ли новых записей, — появится баннер.
    _poll = Timer.periodic(widget.checkInterval, (_) => _c.checkNew());
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _scroll.dispose();
    _c.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _c.checkNew();
  }

  /// Если записей мало и список не прокручивается, прокрутки не будет — догружаем сами.
  void _fillIfShort() {
    if (!mounted || !_scroll.hasClients) return;
    if (_c.hasMore && !_c.loadingMore && !_c.loadMoreFailed && !_c.loading && _scroll.position.maxScrollExtent < 600) _c.loadMore();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _c.loadMore();
  }

  void _toast(Object error) {
    if (mounted) showMessage(context, error is FeedException ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.');
  }

  Future<void> _guard(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      _toast(e);
    }
  }

  Future<void> _openUrl(String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // ───────────── действия ─────────────

  Future<void> _compose({bool story = false}) async {
    final created = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: story, builder: (_) => ComposePage(story: story, source: _source, picker: widget.mediaPicker)));
    if (created != true || !mounted) return;
    if (story) {
      await _c.loadStories();
    } else {
      await _c.refresh();
      if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    }
  }

  void _openComments(FeedPost post) {
    showCommentsSheet(context, source: _source, postId: post.id, meId: _c.meId, postOwnerId: post.memberId, onCountChanged: (d) => _c.commentCountChanged(post.id, d));
  }

  Future<void> _repost(FeedPost post) async {
    if (post.repostedByMe) {
      showMessage(context, 'Вы уже поделились этой записью');
      return;
    }
    final caption = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RepostSheet(authorName: post.author.label),
    );
    if (caption == null || !mounted) return;
    await _guard(() async {
      await _c.repost(post, caption: caption);
      if (mounted) showMessage(context, 'Запись добавлена в вашу ленту');
    });
  }

  Future<void> _menu(FeedPost post, PostMenuAction action) async {
    switch (action) {
      case PostMenuAction.edit:
        final value = await showDialog<String>(context: context, builder: (_) => _EditCaptionDialog(initial: post.caption));
        if (value != null && mounted) await _guard(() => _c.edit(post, value));
      case PostMenuAction.delete:
        final ok = await showDialog<bool>(
          context: context,
          builder: (dialog) => AlertDialog(
            title: const Text('Удалить запись?'),
            content: const Text('Она пропадёт из ленты у всех.'),
            actions: [
              TextButton(key: const ValueKey('delete-cancel'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
              TextButton(key: const ValueKey('delete-ok'), onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
            ],
          ),
        );
        if (ok == true && mounted) await _guard(() => _c.delete(post));
    }
  }

  void _openStories(StoryGroup tapped) {
    final playlist = storyPlaylist(mine: _c.mine, others: _c.others, tapped: tapped);
    Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: true,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (_, _, _) => StoryViewerPage(groups: playlist.groups, start: playlist.start, source: _source, meId: _c.meId, onSeen: _c.storySeen, onDeleted: _c.storyDeleted),
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOut)), child: child)),
    ));
  }

  Future<void> _showNew() async {
    await _c.refresh();
    if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  // ───────────── интерфейс ─────────────

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _fillIfShort());
        return ChurchPage(
        title: 'Лента',
        subtitle: _c.sort == FeedSort.smart ? 'Новости и истории общины' : 'Сначала новые',
        actions: [
          PopupMenuButton<FeedSort>(
            key: const ValueKey('feed-sort'),
            tooltip: 'Порядок ленты',
            icon: const Icon(Icons.tune_rounded),
            initialValue: _c.sort,
            onSelected: _c.setSort,
            itemBuilder: (_) => [for (final s in FeedSort.values) CheckedPopupMenuItem(value: s, checked: s == _c.sort, child: Text(s.label))],
          ),
          HeaderButton(icon: Icons.add_rounded, tooltip: 'Новая запись', accent: true, onPressed: _compose),
        ],
        body: Stack(
          children: [
            Positioned.fill(child: _body(user, session.apiOrigin)),
            Positioned(top: 8, left: 0, right: 0, child: Center(child: AnimatedSwitcher(duration: Motion.fast, child: _c.newCount > 0 ? _NewPill(count: _c.newCount, onTap: _showNew) : const SizedBox.shrink()))),
          ],
        ),
      );
      },
    );
  }

  Widget _body(AppUser? user, String origin) {
    if (_c.loading) return const FeedSkeleton();
    if (_c.error != null && _c.posts.isEmpty) return ErrorView(message: _c.error!, onRetry: _c.refresh);
    final me = FeedAuthor(memberId: user?.id ?? 0, name: user?.displayName ?? 'Вы', avatarUrl: user?.avatarUrl == null || user!.avatarUrl!.isEmpty ? null : resolveUrl(origin, user.avatarUrl));
    // Истории + (пустая подсказка | записи и «подвал»).
    final itemCount = _c.posts.isEmpty ? 2 : _c.posts.length + 2;
    return RefreshIndicator(
      color: context.palette.accent,
      backgroundColor: context.palette.card,
      onRefresh: _c.refresh,
      child: ListView.builder(
        key: const ValueKey('feed-list'),
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 8, bottom: 32),
        itemCount: itemCount,
        itemBuilder: (context, i) {
          if (i == 0) {
            return StoriesBar(me: me, mine: _c.mine, others: _c.others, loaded: _c.storiesLoaded, onOpen: _openStories, onAdd: () => _compose(story: true));
          }
          if (_c.posts.isEmpty) {
            return const Padding(padding: EdgeInsets.only(top: 40), child: EmptyHint('В ленте пока нет записей', icon: Icons.article_outlined, hint: 'Поделитесь новостью или фото — нажмите «+» вверху.'));
          }
          final index = i - 1;
          if (index == _c.posts.length) return _footer();
          final post = _c.posts[index];
          return Padding(
            key: ValueKey('feed-post-${post.id}'),
            padding: const EdgeInsets.fromLTRB(Space.lg, 6, Space.lg, 8),
            child: PostCard(
              post: post,
              meId: _c.meId,
              onLike: () => _guard(() => _c.toggleLike(post)),
              onDoubleTapLike: () => _guard(() => _c.likeOnly(post)),
              onComments: () => _openComments(post),
              onRepost: () => _repost(post),
              onLikers: () => showLikersSheet(context, source: _source, postId: post.id),
              onMenu: (a) => _menu(post, a),
              onOpenUrl: _openUrl,
            ),
          );
        },
      ),
    );
  }

  Widget _footer() {
    final palette = context.palette;
    if (_c.loadingMore) return const Padding(padding: EdgeInsets.all(20), child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.4))));
    if (_c.loadMoreFailed) {
      return Padding(padding: const EdgeInsets.all(16), child: SecondaryButton(key: const ValueKey('feed-more-retry'), label: 'Не удалось загрузить — повторить', icon: Icons.refresh_rounded, onPressed: _c.loadMore));
    }
    if (!_c.hasMore) return Padding(key: const ValueKey('feed-end'), padding: const EdgeInsets.all(24), child: Center(child: Text('Вы посмотрели всё', style: TextStyle(color: palette.inkFaint))));
    return const SizedBox(height: 24);
  }
}

/// Плавающая плашка «Новые записи» вверху ленты.
class _NewPill extends StatelessWidget {
  const _NewPill({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const ValueKey('feed-new-pill'),
      color: ChurchColors.wine,
      elevation: 4,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.arrow_upward_rounded, color: Colors.white, size: 18),
            const SizedBox(width: 6),
            Text(count == 1 ? 'Новая запись' : 'Новые записи · $count', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ]),
        ),
      ),
    );
  }
}

/// Серые заглушки на время первой загрузки.
class FeedSkeleton extends StatelessWidget {
  const FeedSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.palette.outline.withValues(alpha: 0.45);
    Widget bar(double w, double h) => Container(width: w, height: h, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(6)));
    return ListView(
      key: const ValueKey('feed-skeleton'),
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(Space.lg),
      children: [
        Row(children: [for (var i = 0; i < 4; i++) Padding(padding: const EdgeInsets.only(right: 12), child: Container(width: 56, height: 56, decoration: BoxDecoration(shape: BoxShape.circle, color: c)))]),
        const SizedBox(height: 18),
        for (var i = 0; i < 2; i++) ...[
          Row(children: [Container(width: 40, height: 40, decoration: BoxDecoration(shape: BoxShape.circle, color: c)), const SizedBox(width: 10), Column(crossAxisAlignment: CrossAxisAlignment.start, children: [bar(120, 12), const SizedBox(height: 6), bar(70, 10)])]),
          const SizedBox(height: 12),
          bar(double.infinity, 12),
          const SizedBox(height: 6),
          bar(220, 12),
          const SizedBox(height: 12),
          AspectRatio(aspectRatio: 4 / 3, child: Container(decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(Radii.lg)))),
          const SizedBox(height: 24),
        ],
      ],
    );
  }
}

/// Шторка «Поделиться в ленте» со своим полем комментария.
class _RepostSheet extends StatefulWidget {
  const _RepostSheet({required this.authorName});
  final String authorName;

  @override
  State<_RepostSheet> createState() => _RepostSheetState();
}

class _RepostSheetState extends State<_RepostSheet> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Поделиться в ленте', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink)),
          const SizedBox(height: 4),
          Text('Запись «${widget.authorName}» появится в вашей ленте.', style: TextStyle(color: palette.inkMuted)),
          const SizedBox(height: 12),
          TextField(key: const ValueKey('repost-caption'), controller: _text, maxLines: 3, minLines: 1, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'Добавьте комментарий (необязательно)')),
          const SizedBox(height: 12),
          PrimaryButton(key: const ValueKey('repost-send'), label: 'Поделиться', icon: Icons.repeat_rounded, onPressed: () => Navigator.pop(context, _text.text)),
        ],
      ),
    );
  }
}

/// Диалог «Изменить подпись» со своим полем ввода.
class _EditCaptionDialog extends StatefulWidget {
  const _EditCaptionDialog({required this.initial});
  final String initial;

  @override
  State<_EditCaptionDialog> createState() => _EditCaptionDialogState();
}

class _EditCaptionDialogState extends State<_EditCaptionDialog> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Изменить подпись'),
        content: TextField(key: const ValueKey('edit-caption'), controller: _text, autofocus: true, maxLines: 6, minLines: 2, textCapitalization: TextCapitalization.sentences),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          TextButton(key: const ValueKey('edit-save'), onPressed: () => Navigator.pop(context, _text.text), child: const Text('Сохранить')),
        ],
      );
}
