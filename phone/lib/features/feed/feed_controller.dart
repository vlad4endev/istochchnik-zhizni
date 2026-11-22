import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/http_cache.dart';
import 'data/feed_source.dart';
import 'models/feed_models.dart';

/// Состояние раздела «Лента»: записи с бесконечной прокруткой, порядок, баннер «Новые записи»,
/// быстрые действия (лайк, репост, правка, удаление) и кружки историй.
class FeedController extends ChangeNotifier {
  FeedController(this.source, {required this.meId, Stream<String>? cacheChanges}) {
    _storiesSub = cacheChanges?.where((p) => p.startsWith('/api/stories')).listen((_) => unawaited(loadStories()));
  }

  final FeedSource source;
  final int meId;

  List<FeedPost> posts = const [];
  String? nextCursor;
  FeedSort sort = FeedSort.smart;

  /// Идёт первая загрузка, и показывать ещё нечего.
  bool loading = true;
  bool loadingMore = false;

  /// Первая загрузка не удалась и показывать нечего.
  String? error;

  /// Не удалось догрузить следующую страницу (кнопка «Повторить» внизу).
  bool loadMoreFailed = false;

  /// Сколько новых записей появилось, пока смотрели ленту (баннер «Новые записи»).
  int newCount = 0;

  List<StoryGroup> stories = const [];
  bool storiesLoaded = false;

  StreamSubscription<String>? _storiesSub;
  bool _disposed = false;
  int _generation = 0;
  final Set<String> _busy = {};

  bool get hasMore => nextCursor != null;

  bool isBusy(String postId) => _busy.contains(postId);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  FeedPost? byId(String id) {
    for (final p in posts) {
      if (p.id == id) return p;
    }
    return null;
  }

  // ───────────── лента ─────────────

  /// Открытие раздела: первая страница; если записи уже есть — тихо, без спиннера.
  Future<void> load() => _loadFirst(fresh: false);

  /// «Потянули вниз» и «Показать новые»: только с сервера.
  Future<void> refresh() => _loadFirst(fresh: true);

  Future<void> _loadFirst({required bool fresh}) async {
    final generation = ++_generation;
    final first = posts.isEmpty;
    if (first) {
      loading = true;
      error = null;
      _notify();
    }
    try {
      final page = await (fresh ? HttpCache.fresh(() => source.feed(sort: sort)) : source.feed(sort: sort));
      if (_disposed || generation != _generation) return;
      posts = page.posts;
      nextCursor = page.nextCursor;
      loadMoreFailed = false;
      error = null;
      newCount = 0;
      unawaited(_markSeen());
    } catch (e) {
      if (_disposed || generation != _generation) return;
      if (first) error = _text(e);
    }
    loading = false;
    _notify();
    unawaited(loadStories());
  }

  Future<void> _markSeen() async {
    try {
      await source.markSeen();
    } catch (_) {
      /* бейдж подождёт до следующего раза */
    }
  }

  Future<void> loadMore() async {
    if (loadingMore || nextCursor == null || loading) return;
    final generation = _generation;
    loadingMore = true;
    loadMoreFailed = false;
    _notify();
    try {
      final page = await source.feed(cursor: nextCursor, sort: sort);
      if (_disposed || generation != _generation) return;
      final known = {for (final p in posts) p.id};
      posts = [...posts, ...page.posts.where((p) => !known.contains(p.id))];
      nextCursor = page.nextCursor;
    } catch (_) {
      if (_disposed || generation != _generation) return;
      loadMoreFailed = true;
    }
    loadingMore = false;
    _notify();
  }

  Future<void> setSort(FeedSort next) async {
    if (next == sort) return;
    sort = next;
    posts = const [];
    nextCursor = null;
    newCount = 0;
    await _loadFirst(fresh: true);
  }

  /// Спросить сервер, есть ли новые записи (вызывается по таймеру, пока раздел открыт).
  Future<void> checkNew() async {
    if (loading) return;
    final count = await source.unreadCount();
    if (_disposed || count == newCount) return;
    newCount = count;
    _notify();
  }

  // ───────────── действия с записью ─────────────

  void _replace(String id, FeedPost Function(FeedPost) change) {
    posts = [for (final p in posts) p.id == id ? change(p) : p];
  }

  /// Лайк сразу на экране; при сбое возвращается как было и бросается [FeedException].
  Future<void> toggleLike(FeedPost post) async {
    if (!_busy.add(post.id)) return;
    final want = !post.likedByMe;
    _replace(post.id, (p) => p.copyWith(likedByMe: want, likeCount: (p.likeCount + (want ? 1 : -1)).clamp(0, 1 << 30)));
    _notify();
    try {
      await source.setLike(post.id, liked: want);
    } catch (e) {
      _replace(post.id, (p) => p.copyWith(likedByMe: post.likedByMe, likeCount: post.likeCount));
      _busy.remove(post.id);
      _notify();
      throw FeedException(_text(e));
    }
    _busy.remove(post.id);
  }

  /// Двойной тап: ставит «нравится», но не снимает его.
  Future<void> likeOnly(FeedPost post) async {
    if (post.likedByMe) return;
    await toggleLike(post);
  }

  Future<void> repost(FeedPost post, {String? caption}) async {
    try {
      await source.repost(post.id, caption: caption);
    } catch (e) {
      throw FeedException(_text(e));
    }
    _replace(post.id, (p) => p.copyWith(repostedByMe: true, repostCount: p.repostCount + 1));
    _notify();
    unawaited(_loadFirst(fresh: true));
  }

  Future<void> delete(FeedPost post) async {
    try {
      await source.deletePost(post.id);
    } catch (e) {
      throw FeedException(_text(e));
    }
    posts = [for (final p in posts) if (p.id != post.id) p];
    _notify();
  }

  Future<void> edit(FeedPost post, String caption) async {
    try {
      await source.editPost(post.id, caption);
    } catch (e) {
      throw FeedException(_text(e));
    }
    _replace(post.id, (p) => p.copyWith(caption: caption.trim()));
    _notify();
  }

  /// Число комментариев изменилось (добавили или удалили в шторке).
  void commentCountChanged(String postId, int delta) {
    _replace(postId, (p) => p.copyWith(commentCount: (p.commentCount + delta).clamp(0, 1 << 30)));
    _notify();
  }

  // ───────────── истории ─────────────

  Future<void> loadStories() async {
    try {
      final list = await source.stories();
      if (_disposed) return;
      stories = list;
      storiesLoaded = true;
      _notify();
    } catch (_) {
      if (_disposed) return;
      storiesLoaded = true;
      _notify();
    }
  }

  StoryGroup? get mine {
    for (final g in stories) {
      if (g.isMe || g.author.memberId == meId) return g;
    }
    return null;
  }

  /// Чужие истории: непросмотренные первыми, остальной порядок сохраняется.
  List<StoryGroup> get others {
    final list = [for (final g in stories) if (!(g.isMe || g.author.memberId == meId)) g];
    return [...list.where((g) => !g.allSeen), ...list.where((g) => g.allSeen)];
  }

  /// История просмотрена: кружок сереет сразу, на сервер — в фоне.
  void storySeen(int authorId, String storyId) {
    stories = [for (final g in stories) g.author.memberId == authorId ? g.withViewed(storyId) : g];
    _notify();
    unawaited(source.markStoryViewed(storyId).catchError((Object _) {}));
  }

  void storyDeleted(String storyId) {
    stories = [
      for (final g in stories)
        if (g.stories.any((s) => s.id == storyId))
          if (g.stories.length > 1) StoryGroup(author: g.author, isMe: g.isMe, stories: [for (final s in g.stories) if (s.id != storyId) s]) else ...const <StoryGroup>[]
        else
          g,
    ];
    _notify();
  }

  String _text(Object e) => e is FeedException ? e.message : 'Не удалось выполнить действие. Проверьте интернет и попробуйте снова.';

  @override
  void dispose() {
    _disposed = true;
    _storiesSub?.cancel();
    super.dispose();
  }
}
