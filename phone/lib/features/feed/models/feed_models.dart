import '../../../core/dates.dart';
import '../../../core/json.dart';

/// Превращает путь с сервера в полный адрес.
typedef UrlResolver = String Function(String raw);

/// Автор записи, комментария или истории.
class FeedAuthor {
  const FeedAuthor({required this.memberId, required this.name, this.username = '', this.avatarUrl});

  final int memberId;
  final String name;
  final String username;
  final String? avatarUrl;

  /// Имя для подписи: имя и фамилия, иначе логин, иначе «Участник».
  String get label => name.trim().isNotEmpty ? name.trim() : (username.trim().isNotEmpty ? username.trim() : 'Участник');

  static FeedAuthor parse(Object? raw, UrlResolver resolve, {int fallbackId = 0}) {
    final m = asMap(raw);
    final first = str(m['first_name']).trim();
    final last = str(m['last_name']).trim();
    final display = str(m['display_name']).trim();
    final name = display.isNotEmpty ? display : '$first $last'.trim();
    final avatar = str(m['avatar_url']).trim();
    final id = asInt(m['member_id']);
    return FeedAuthor(
      memberId: id > 0 ? id : fallbackId,
      name: name,
      username: str(m['username']).trim(),
      avatarUrl: avatar.isEmpty ? null : resolve(avatar),
    );
  }
}

/// Фото или видео записи.
class PostMedia {
  const PostMedia({required this.url, required this.isVideo});
  final String url;
  final bool isVideo;

  static List<PostMedia> parseList(Object? raw, UrlResolver resolve) {
    final items = [for (final e in asList(raw)) asMap(e)]..sort((a, b) => asInt(a['order']).compareTo(asInt(b['order'])));
    return [
      for (final m in items)
        if (str(m['url']).trim().isNotEmpty) PostMedia(url: resolve(str(m['url']).trim()), isVideo: str(m['type']) == 'video'),
    ];
  }
}

/// Запись, которой поделились (репост): показывается внутри нового поста.
class EmbeddedPost {
  const EmbeddedPost({required this.id, required this.author, required this.caption, required this.createdAt, required this.media});
  final String id;
  final FeedAuthor author;
  final String caption;
  final DateTime? createdAt;
  final List<PostMedia> media;

  static EmbeddedPost? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    if (m.isEmpty || str(m['id']).isEmpty) return null;
    return EmbeddedPost(
      id: str(m['id']),
      author: FeedAuthor.parse(m['author'], resolve, fallbackId: asInt(m['member_id'])),
      caption: str(m['caption']).trim(),
      createdAt: parseApiDate(m['created_at']),
      media: PostMedia.parseList(m['media'], resolve),
    );
  }
}

/// Запись в ленте.
class FeedPost {
  const FeedPost({
    required this.id,
    required this.memberId,
    required this.author,
    required this.caption,
    required this.createdAt,
    required this.media,
    required this.likeCount,
    required this.commentCount,
    required this.repostCount,
    required this.likedByMe,
    required this.repostedByMe,
    this.shared,
  });

  final String id;
  final int memberId;
  final FeedAuthor author;
  final String caption;
  final DateTime? createdAt;
  final List<PostMedia> media;
  final int likeCount;
  final int commentCount;
  final int repostCount;
  final bool likedByMe;
  final bool repostedByMe;
  final EmbeddedPost? shared;

  bool get hasMedia => media.isNotEmpty;

  FeedPost copyWith({String? caption, int? likeCount, int? commentCount, int? repostCount, bool? likedByMe, bool? repostedByMe}) => FeedPost(
        id: id,
        memberId: memberId,
        author: author,
        caption: caption ?? this.caption,
        createdAt: createdAt,
        media: media,
        likeCount: likeCount ?? this.likeCount,
        commentCount: commentCount ?? this.commentCount,
        repostCount: repostCount ?? this.repostCount,
        likedByMe: likedByMe ?? this.likedByMe,
        repostedByMe: repostedByMe ?? this.repostedByMe,
        shared: shared,
      );

  static FeedPost? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    final id = str(m['id']);
    if (id.isEmpty) return null;
    final memberId = asInt(m['member_id']);
    return FeedPost(
      id: id,
      memberId: memberId,
      author: FeedAuthor.parse(m['author'], resolve, fallbackId: memberId),
      caption: str(m['caption']).trim(),
      createdAt: parseApiDate(m['created_at']),
      media: PostMedia.parseList(m['media'], resolve),
      likeCount: asInt(m['like_count']),
      commentCount: asInt(m['comment_count']),
      repostCount: asInt(m['repost_count']),
      likedByMe: asBool(m['liked_by_me']),
      repostedByMe: asBool(m['reposted_by_me']),
      shared: EmbeddedPost.tryParse(m['shared_post'], resolve),
    );
  }
}

/// Страница ленты и курсор следующей (null — больше нет).
class FeedPageData {
  const FeedPageData({required this.posts, this.nextCursor});
  final List<FeedPost> posts;
  final String? nextCursor;

  static FeedPageData parse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    final cursor = str(m['next_cursor']).trim();
    return FeedPageData(
      posts: [for (final e in asList(m['posts'])) ?FeedPost.tryParse(e, resolve)],
      nextCursor: cursor.isEmpty ? null : cursor,
    );
  }
}

/// Порядок ленты: «умный» (по интересу) или по времени.
enum FeedSort {
  smart('smart', 'Для вас'),
  recent('recent', 'Новые');

  const FeedSort(this.code, this.label);
  final String code;
  final String label;
}

/// Комментарий к записи.
class FeedComment {
  const FeedComment({required this.id, required this.postId, required this.memberId, required this.text, required this.createdAt, required this.author, this.likeCount = 0, this.likedByMe = false});

  final String id;
  final String postId;
  final int memberId;
  final String text;
  final DateTime? createdAt;
  final FeedAuthor author;
  final int likeCount;
  final bool likedByMe;

  FeedComment copyWith({int? likeCount, bool? likedByMe}) => FeedComment(
        id: id,
        postId: postId,
        memberId: memberId,
        text: text,
        createdAt: createdAt,
        author: author,
        likeCount: likeCount ?? this.likeCount,
        likedByMe: likedByMe ?? this.likedByMe,
      );

  static FeedComment? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    final id = str(m['id']);
    if (id.isEmpty) return null;
    final memberId = asInt(m['member_id']);
    var text = '';
    for (final key in ['text', 'body', 'content', 'caption']) {
      if (str(m[key]).isNotEmpty) {
        text = str(m[key]);
        break;
      }
    }
    return FeedComment(
      id: id,
      postId: str(m['post_id']),
      memberId: memberId,
      text: text,
      createdAt: parseApiDate(m['created_at']),
      author: FeedAuthor.parse(m['author'], resolve, fallbackId: memberId),
      likeCount: asInt(m['like_count']),
      likedByMe: asBool(m['liked_by_me']),
    );
  }
}

/// Кто поставил «нравится».
class Liker {
  const Liker({required this.author, required this.likedAt});
  final FeedAuthor author;
  final DateTime? likedAt;

  static Liker? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    if (m.isEmpty) return null;
    return Liker(author: FeedAuthor.parse(m, resolve), likedAt: parseApiDate(m['liked_at']));
  }
}

class LikersPageData {
  const LikersPageData({required this.likers, required this.total, this.nextCursor});
  final List<Liker> likers;
  final int total;
  final String? nextCursor;
}

/// Одна история: фото или видео на 24 часа.
class StoryItem {
  const StoryItem({required this.id, required this.memberId, required this.mediaUrl, required this.isVideo, required this.caption, required this.createdAt, required this.expiresAt, required this.viewed});

  final String id;
  final int memberId;
  final String mediaUrl;
  final bool isVideo;
  final String caption;
  final DateTime? createdAt;
  final DateTime? expiresAt;
  final bool viewed;

  StoryItem copyWith({bool? viewed}) => StoryItem(id: id, memberId: memberId, mediaUrl: mediaUrl, isVideo: isVideo, caption: caption, createdAt: createdAt, expiresAt: expiresAt, viewed: viewed ?? this.viewed);

  static StoryItem? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    final id = str(m['id']);
    final url = str(m['media_url']).trim();
    if (id.isEmpty || url.isEmpty) return null;
    return StoryItem(
      id: id,
      memberId: asInt(m['member_id']),
      mediaUrl: resolve(url),
      isVideo: str(m['media_type']) == 'video',
      caption: str(m['caption']).trim(),
      createdAt: parseApiDate(m['created_at']),
      expiresAt: parseApiDate(m['expires_at']),
      viewed: asBool(m['viewed_by_me']),
    );
  }
}

/// Истории одного автора (кружок в ленте).
class StoryGroup {
  const StoryGroup({required this.author, required this.stories, required this.isMe});

  final FeedAuthor author;
  final List<StoryItem> stories;
  final bool isMe;

  /// Всё просмотрено: кружок серый.
  bool get allSeen => stories.isNotEmpty && stories.every((s) => s.viewed);

  /// Индекс первой непросмотренной истории (если все просмотрены — 0, смотрим сначала).
  int get firstUnseen {
    final i = stories.indexWhere((s) => !s.viewed);
    return i < 0 ? 0 : i;
  }

  StoryGroup withViewed(String storyId) => StoryGroup(
        author: author,
        isMe: isMe,
        stories: [for (final s in stories) s.id == storyId ? s.copyWith(viewed: true) : s],
      );

  static StoryGroup? tryParse(Object? raw, UrlResolver resolve) {
    final m = asMap(raw);
    final stories = [for (final e in asList(m['stories'])) ?StoryItem.tryParse(e, resolve)];
    if (stories.isEmpty) return null;
    return StoryGroup(author: FeedAuthor.parse(m['author'], resolve, fallbackId: stories.first.memberId), stories: stories, isMe: asBool(m['is_me']));
  }
}
