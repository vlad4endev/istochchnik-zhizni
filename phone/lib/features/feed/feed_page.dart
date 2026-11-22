import 'package:dio/dio.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/dates.dart';
import '../../ui/kit/kit.dart';
import '../../ui/video_page.dart';
import '../../ui/widgets.dart';
import 'compose_page.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> with CacheWatcher<FeedPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _posts = const [];
  List<dynamic> _stories = const [];

  @override
  void initState() {
    super.initState();
    _load();
    watchCache(const ['/api/feed', '/api/stories'], () => _load(quiet: true));
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final api = ChurchApi(context.read<SessionController>());
    try {
      final feed = await api.feed();
      Map<String, dynamic> stories = {};
      try {
        stories = await api.stories();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _posts = asList(feed['posts']);
        _stories = asList(stories['groups']);
        _loading = false;
      });
    } catch (error) {
      if (!mounted || quiet) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _like(Map<String, dynamic> post) async {
    final id = str(post['id']);
    final liked = asBool(post['liked_by_me']);
    try {
      await ChurchApi(context.read<SessionController>()).like(id, liked: liked);
      await _load();
    } on DioException catch (error) {
      if (!mounted) return;
      showMessage(context, readApiError(error));
    }
  }

  Future<void> _compose({bool story = false}) async {
    final created = await pushPage<bool>(context, ComposePage(story: story));
    if (created == true) _load();
  }

  Future<void> _comments(String postId) async {
    final api = ChurchApi(context.read<SessionController>());
    final draft = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
          child: FutureBuilder<List<dynamic>>(
          future: api.comments(postId),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SizedBox(height: 180, child: Center(child: CircularProgressIndicator()));
            }
            final items = snapshot.data ?? const [];
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 240,
                  child: items.isEmpty
                      ? const EmptyHint('Комментариев пока нет', icon: Icons.chat_bubble_outline_rounded, hint: 'Будьте первым')
                      : ListView(
                          children: [
                            for (final raw in items)
                              ListRow(
                                leading: ChurchAvatar(name: _commentAuthor(asMap(raw)), size: 36),
                                title: _commentAuthor(asMap(raw)),
                                subtitle: _commentText(asMap(raw)),
                                subtitleMaxLines: 6,
                              ),
                          ],
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  child: Row(
                    children: [
                      Expanded(child: TextField(controller: draft, decoration: const InputDecoration(hintText: 'Напишите комментарий'))),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        tooltip: 'Отправить',
                        style: IconButton.styleFrom(backgroundColor: ChurchColors.wine, foregroundColor: Colors.white),
                        onPressed: () async {
                          final text = draft.text.trim();
                          if (text.isEmpty) return;
                          try {
                            await api.addComment(postId, text);
                            if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                            _load();
                          } catch (error) {
                            if (!sheetContext.mounted) return;
                            ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(describeDio(error))));
                          }
                        },
                        icon: const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
        );
      },
    );
    draft.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final origin = session.apiOrigin;
    final me = session.user?.displayName ?? 'Вы';
    return ChurchPage(
      title: 'Лента',
      subtitle: 'Новости и истории общины',
      actions: [
        HeaderButton(icon: Icons.add_rounded, tooltip: 'Новая запись', onPressed: _compose),
      ],
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          padding: const EdgeInsets.fromLTRB(0, 16, 0, 32),
          children: [
            SizedBox(
              height: 92,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                children: [
                  _StoryBubble(
                    name: 'Ваша',
                    avatarName: me,
                    add: true,
                    onTap: () => _compose(story: true),
                  ),
                  for (final raw in _stories)
                    Builder(builder: (context) {
                      final group = asMap(raw);
                      final author = asMap(group['author']);
                      final name = str(author['display_name']).isEmpty ? str(author['username']) : str(author['display_name']);
                      return _StoryBubble(
                        name: name.split(' ').first,
                        avatarName: name,
                        imageUrl: resolveUrl(origin, str(author['avatar_url'])),
                        seen: asBool(group['all_seen']),
                        onTap: () => pushPage(context, StoryPage(group: group, origin: origin)),
                      );
                    }),
                ],
              ),
            ),
            if (_posts.isEmpty)
              const EmptyHint(
                'В ленте пока нет записей',
                icon: Icons.article_outlined,
                hint: 'Поделитесь новостью или фото — нажмите «+» вверху.',
              ),
            for (final raw in _posts)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                child: _PostCard(post: asMap(raw), origin: origin, onLike: _like, onComments: _comments),
              ),
          ],
        ),
      ),
    );
  }
}

class _StoryBubble extends StatelessWidget {
  const _StoryBubble({
    required this.name,
    required this.avatarName,
    required this.onTap,
    this.imageUrl,
    this.seen = false,
    this.add = false,
  });

  final String name;
  final String avatarName;
  final String? imageUrl;
  final bool seen;
  final bool add;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      label: add ? 'Добавить историю' : 'История: $avatarName',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: onTap,
        child: SizedBox(
          width: 72,
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    padding: const EdgeInsets.all(2.5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: add || seen
                          ? null
                          : const SweepGradient(colors: [ChurchColors.amber, Color(0xFFC0304F), ChurchColors.amber]),
                      color: add ? palette.outline : (seen ? palette.chevron.withValues(alpha: 0.5) : null),
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(shape: BoxShape.circle, color: palette.sheet),
                      child: ChurchAvatar(name: avatarName, imageUrl: imageUrl, size: 50),
                    ),
                  ),
                  if (add)
                    Positioned(
                      right: -1,
                      bottom: -1,
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: ChurchColors.amberBlob,
                          border: Border.all(color: palette.sheet, width: 2),
                        ),
                        child: const Icon(Icons.add_rounded, size: 15, color: Colors.white),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: palette.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({
    required this.post,
    required this.origin,
    required this.onLike,
    required this.onComments,
  });

  final Map<String, dynamic> post;
  final String origin;
  final Future<void> Function(Map<String, dynamic> post) onLike;
  final Future<void> Function(String id) onComments;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final author = asMap(post['author']);
    final name = str(author['display_name']).isEmpty ? 'Участник' : str(author['display_name']);
    final media = asList(post['media']);
    final first = media.isEmpty ? null : asMap(media.first);
    final mediaUrl = first == null ? '' : resolveUrl(origin, str(first['url']));
    final video = first != null && str(first['type']) == 'video';
    final image = !video ? mediaUrl : '';
    final liked = asBool(post['liked_by_me']);
    return ChurchCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ChurchAvatar(name: name, imageUrl: resolveUrl(origin, str(author['avatar_url'])), size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ChurchType.title.copyWith(fontSize: 15, color: palette.ink),
                    ),
                    Text(relativeTime(post['created_at']), style: TextStyle(fontSize: 12, color: palette.inkFaint)),
                  ],
                ),
              ),
            ],
          ),
          if (str(post['caption']).isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(str(post['caption']), style: ChurchType.body.copyWith(color: palette.ink)),
          ],
          if (video && mediaUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            InkWell(
              borderRadius: BorderRadius.circular(Radii.lg),
              onTap: () => pushPage(context, VideoPage(url: mediaUrl, caption: str(post['caption']))),
              child: Container(
                height: 180,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(Radii.lg),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF6C1E32), ChurchColors.amberBlob],
                  ),
                ),
                child: Center(
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.22)),
                    child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 34, semanticLabel: 'Смотреть видео'),
                  ),
                ),
              ),
            ),
          ],
          if (image.isNotEmpty) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.lg),
              child: Image.network(
                image,
                height: 220,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(height: 120, color: palette.accentSoft),
              ),
            ),
          ],
          const SizedBox(height: 4),
          Row(
            children: [
              _Reaction(
                icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color: liked ? ChurchColors.wine : palette.inkMuted,
                count: asInt(post['like_count']),
                label: liked ? 'Убрать отметку «нравится»' : 'Нравится',
                onTap: () => onLike(post),
              ),
              _Reaction(
                icon: Icons.chat_bubble_outline_rounded,
                color: palette.inkMuted,
                count: asInt(post['comment_count']),
                label: 'Комментарии',
                onTap: () => onComments(str(post['id'])),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Reaction extends StatelessWidget {
  const _Reaction({required this.icon, required this.color, required this.count, required this.label, required this.onTap});

  final IconData icon;
  final Color color;
  final int count;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$label, $count',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 21, color: color),
                const SizedBox(width: 6),
                Text('$count', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: context.palette.inkMuted)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class StoryPage extends StatelessWidget {
  const StoryPage({super.key, required this.group, required this.origin});
  final Map<String, dynamic> group;
  final String origin;

  @override
  Widget build(BuildContext context) {
    final stories = asList(group['stories']);
    final author = asMap(group['author']);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Row(
          children: [
            ChurchAvatar(name: str(author['display_name']), size: 34, ring: true),
            const SizedBox(width: 10),
            Expanded(child: Text(str(author['display_name']), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
          ],
        ),
      ),
      body: PageView(
        children: [
          for (final raw in stories)
            _StorySlide(story: asMap(raw), origin: origin),
        ],
      ),
    );
  }
}

class _StorySlide extends StatelessWidget {
  const _StorySlide({required this.story, required this.origin});
  final Map<String, dynamic> story;
  final String origin;

  @override
  Widget build(BuildContext context) {
    final url = resolveUrl(origin, str(story['media_url']));
    final video = str(story['media_type']) == 'video';
    if (video && url.isNotEmpty) {
      return VideoPage(url: url, caption: str(story['caption']));
    }
    return Column(
      children: [
        Expanded(
          child: url.isEmpty
              ? const Center(child: Text('Нет изображения', style: TextStyle(color: Colors.white)))
              : Image.network(url, fit: BoxFit.contain),
        ),
        if (str(story['caption']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(str(story['caption']), style: const TextStyle(color: Colors.white)),
          ),
      ],
    );
  }
}

String _commentAuthor(Map<String, dynamic> comment) {
  final author = asMap(comment['author']);
  final name = str(author['display_name']);
  if (name.isNotEmpty) return name;
  return str(comment['author_name']).isEmpty ? 'Участник' : str(comment['author_name']);
}

String _commentText(Map<String, dynamic> comment) {
  for (final key in ['text', 'body', 'content', 'caption']) {
    if (str(comment[key]).isNotEmpty) return str(comment[key]);
  }
  return '';
}
