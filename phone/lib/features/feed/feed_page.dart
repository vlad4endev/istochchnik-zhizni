import 'package:dio/dio.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _posts = const [];
  List<dynamic> _stories = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
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
      if (!mounted) return;
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(readApiError(error))));
    }
  }

  Future<void> _comments(String postId) async {
    final api = ChurchApi(context.read<SessionController>());
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return FutureBuilder<List<dynamic>>(
          future: api.comments(postId),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SizedBox(height: 180, child: Center(child: CircularProgressIndicator()));
            }
            final items = snapshot.data ?? const [];
            if (items.isEmpty) return const SizedBox(height: 160, child: EmptyHint('Комментариев пока нет'));
            return ListView(
              children: [
                for (final raw in items)
                  ListTile(
                    title: Text(_commentAuthor(asMap(raw))),
                    subtitle: Text(_commentText(asMap(raw))),
                  ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final origin = context.watch<SessionController>().apiOrigin;
    return Scaffold(
      appBar: AppBar(title: const Text('Лента')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            children: [
              if (_stories.isNotEmpty)
                SizedBox(
                  height: 96,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: _stories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final group = asMap(_stories[index]);
                      final author = asMap(group['author']);
                      final name = str(author['display_name']).isEmpty ? str(author['username']) : str(author['display_name']);
                      return InkWell(
                        onTap: () => pushPage(context, StoryPage(group: group, origin: origin)),
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 26,
                              backgroundColor: asBool(group['all_seen']) ? Colors.grey : Theme.of(context).colorScheme.primary,
                              child: Text(name.isEmpty ? '?' : name.substring(0, 1)),
                            ),
                            const SizedBox(height: 4),
                            SizedBox(width: 68, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              if (_posts.isEmpty) const SizedBox(height: 240, child: EmptyHint('В ленте пока нет записей')),
              for (final raw in _posts) _PostCard(post: asMap(raw), origin: origin, onLike: _like, onComments: _comments),
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
    final author = asMap(post['author']);
    final name = str(author['display_name']).isEmpty ? 'Участник' : str(author['display_name']);
    final media = asList(post['media']);
    final first = media.isEmpty ? null : asMap(media.first);
    final image = first != null && str(first['type']) != 'video' ? resolveUrl(origin, str(first['url'])) : '';
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(title: Text(name), subtitle: Text(str(post['created_at']))),
          if (str(post['caption']).isNotEmpty)
            Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 12), child: Text(str(post['caption']))),
          if (image.isNotEmpty) Image.network(image, height: 220, width: double.infinity, fit: BoxFit.cover),
          Row(
            children: [
              IconButton(
                onPressed: () => onLike(post),
                icon: Icon(asBool(post['liked_by_me']) ? Icons.favorite : Icons.favorite_border),
              ),
              Text('${asInt(post['like_count'])}'),
              IconButton(
                onPressed: () => onComments(str(post['id'])),
                icon: const Icon(Icons.chat_bubble_outline),
              ),
              Text('${asInt(post['comment_count'])}'),
            ],
          ),
        ],
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
        title: Text(str(author['display_name'])),
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
    return Column(
      children: [
        Expanded(
          child: video || url.isEmpty
              ? const Center(child: Text('Видео откроется в следующем обновлении', style: TextStyle(color: Colors.white)))
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
