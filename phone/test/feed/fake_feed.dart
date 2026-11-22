import 'dart:async';

import 'package:molitva/features/feed/data/feed_source.dart';
import 'package:molitva/features/feed/models/feed_models.dart';

FeedAuthor person(int id, String name) => FeedAuthor(memberId: id, name: name);

FeedPost post(
  String id, {
  int by = 2,
  String name = 'Анна Орлова',
  String caption = 'Текст записи',
  int likes = 0,
  int comments = 0,
  bool liked = false,
  List<PostMedia> media = const [],
  EmbeddedPost? shared,
  DateTime? at,
}) =>
    FeedPost(
      id: id,
      memberId: by,
      author: person(by, name),
      caption: caption,
      createdAt: at ?? DateTime(2026, 11, 22, 10, int.tryParse(id) ?? 0),
      media: media,
      likeCount: likes,
      commentCount: comments,
      repostCount: 0,
      likedByMe: liked,
      repostedByMe: false,
      shared: shared,
    );

StoryItem story(String id, {int by = 2, bool viewed = false, bool video = false, String caption = ''}) => StoryItem(
      id: id,
      memberId: by,
      mediaUrl: 'https://x/$id.${video ? 'mp4' : 'jpg'}',
      isVideo: video,
      caption: caption,
      createdAt: DateTime.now().subtract(const Duration(hours: 1)),
      expiresAt: DateTime.now().add(const Duration(hours: 23)),
      viewed: viewed,
    );

StoryGroup storyGroup(int by, String name, List<StoryItem> items, {bool me = false}) => StoryGroup(author: person(by, name), stories: items, isMe: me);

/// Лента без сети: ответы из полей, сбои включаются по отдельности.
class FakeFeed implements FeedSource {
  final calls = <String>[];
  List<FeedPost> all = [];
  int pageSize = 20;
  int unread = 0;
  List<StoryGroup> storyGroups = [];
  List<FeedComment> commentList = [];
  List<Liker> likerList = [];
  Completer<void>? gate;

  bool failFeed = false;
  bool failMore = false;
  bool failLike = false;
  bool failAction = false;
  bool failStories = false;
  bool failComments = false;
  String? replyChat = '77';

  Future<void> _wait() async {
    if (gate != null) await gate!.future;
  }

  @override
  Future<FeedPageData> feed({String? cursor, FeedSort sort = FeedSort.smart, int limit = 20}) async {
    calls.add('feed:${cursor ?? ''}:${sort.code}');
    await _wait();
    if (failFeed || (cursor != null && failMore)) throw const FeedException('нет связи');
    final start = cursor == null ? 0 : int.parse(cursor);
    final end = (start + pageSize).clamp(0, all.length);
    return FeedPageData(posts: all.sublist(start, end), nextCursor: end < all.length ? '$end' : null);
  }

  @override
  Future<int> unreadCount() async {
    calls.add('unread');
    return unread;
  }

  @override
  Future<void> markSeen() async => calls.add('markSeen');

  @override
  Future<void> setLike(String postId, {required bool liked}) async {
    calls.add('like:$postId:$liked');
    await _wait();
    if (failLike) throw const FeedException('не вышло');
  }

  @override
  Future<void> repost(String postId, {String? caption}) async {
    calls.add('repost:$postId:${caption ?? ''}');
    if (failAction) throw const FeedException('уже поделились');
  }

  @override
  Future<void> deletePost(String postId) async {
    calls.add('delete:$postId');
    if (failAction) throw const FeedException('не вышло');
    all = [for (final p in all) if (p.id != postId) p];
  }

  @override
  Future<void> editPost(String postId, String caption) async {
    calls.add('edit:$postId:$caption');
    if (failAction) throw const FeedException('не вышло');
  }

  final created = <String>[];

  @override
  Future<void> createPost({required String caption, List<UploadFile> files = const [], void Function(double fraction)? onProgress}) async {
    calls.add('create:${files.length}:$caption');
    onProgress?.call(0.5);
    await _wait();
    if (failAction) throw const FeedException('Хранилище файлов не настроено');
    onProgress?.call(1);
    created.add(caption);
  }

  @override
  Future<List<FeedComment>> comments(String postId) async {
    calls.add('comments:$postId');
    if (failComments) throw const FeedException('нет связи');
    return commentList;
  }

  @override
  Future<FeedComment?> addComment(String postId, String text) async {
    calls.add('addComment:$postId:$text');
    if (failAction) throw const FeedException('не вышло');
    return FeedComment(id: '${100 + commentList.length}', postId: postId, memberId: 9, text: text, createdAt: DateTime.now(), author: person(9, 'Мария Лис'));
  }

  @override
  Future<void> deleteComment(String postId, String commentId) async {
    calls.add('delComment:$commentId');
    if (failAction) throw const FeedException('не вышло');
  }

  @override
  Future<void> setCommentLike(String postId, String commentId, {required bool liked}) async {
    calls.add('commentLike:$commentId:$liked');
    if (failLike) throw const FeedException('не вышло');
  }

  @override
  Future<LikersPageData> likers(String postId, {String? cursor}) async {
    calls.add('likers:$postId');
    return LikersPageData(likers: likerList, total: likerList.length);
  }

  @override
  Future<List<StoryGroup>> stories() async {
    calls.add('stories');
    if (failStories) throw const FeedException('нет связи');
    return storyGroups;
  }

  @override
  Future<void> createStory({required UploadFile file, String? caption, void Function(double fraction)? onProgress}) async {
    calls.add('createStory:${file.name}:${caption ?? ''}');
    onProgress?.call(1);
    if (failAction) throw const FeedException('не вышло');
  }

  @override
  Future<void> markStoryViewed(String storyId) async => calls.add('view:$storyId');

  @override
  Future<void> deleteStory(String storyId) async {
    calls.add('delStory:$storyId');
    if (failAction) throw const FeedException('не вышло');
  }

  @override
  Future<String> replyToStory(String storyId, {String? text, String? reaction}) async {
    calls.add('reply:$storyId:${text ?? ''}:${reaction ?? ''}');
    if (failAction || replyChat == null) throw const FeedException('не вышло');
    return replyChat!;
  }
}
