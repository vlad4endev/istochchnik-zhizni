import 'package:dio/dio.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/feed_models.dart';

/// Выбранный для загрузки файл.
class UploadFile {
  const UploadFile({required this.path, required this.name});
  final String path;
  final String name;
}

/// Ошибка с текстом для человека (ответ сервера или «нет связи»).
class FeedException implements Exception {
  const FeedException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Всё, что раздел «Лента» берёт с сервера. Интерфейс нужен тестам: контроллер не знает про Dio.
abstract class FeedSource {
  Future<FeedPageData> feed({String? cursor, FeedSort sort = FeedSort.smart, int limit = 20});
  Future<int> unreadCount();
  Future<void> markSeen();

  Future<void> setLike(String postId, {required bool liked});
  Future<void> repost(String postId, {String? caption});
  Future<void> deletePost(String postId);
  Future<void> editPost(String postId, String caption);
  Future<void> createPost({required String caption, List<UploadFile> files = const [], void Function(double fraction)? onProgress});

  Future<List<FeedComment>> comments(String postId);
  Future<FeedComment?> addComment(String postId, String text);
  Future<void> deleteComment(String postId, String commentId);
  Future<void> setCommentLike(String postId, String commentId, {required bool liked});
  Future<LikersPageData> likers(String postId, {String? cursor});

  Future<List<StoryGroup>> stories();
  Future<void> createStory({required UploadFile file, String? caption, void Function(double fraction)? onProgress});
  Future<void> markStoryViewed(String storyId);
  Future<void> deleteStory(String storyId);

  /// Ответ или реакция на историю — уходит личным сообщением автору; возвращает id чата.
  Future<String> replyToStory(String storyId, {String? text, String? reaction});
}

class FeedApi implements FeedSource {
  FeedApi(this.session);
  final SessionController session;

  String _url(String raw) => resolveUrl(session.apiOrigin, raw);

  Future<Object?> _get(String path, {Map<String, dynamic>? query}) async => (await session.dio.get<Object?>(path, queryParameters: query)).data;

  Future<Object?> _send(String method, String path, {Object? data, Options? options}) async =>
      (await session.dio.request<Object?>(path, data: data, options: (options ?? Options()).copyWith(method: method))).data;

  /// Любой сбой — в понятный текст (ответ сервера, если он есть).
  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw FeedException(readApiError(e));
    }
  }

  @override
  Future<FeedPageData> feed({String? cursor, FeedSort sort = FeedSort.smart, int limit = 20}) =>
      _guard(() async => FeedPageData.parse(await _get('/api/feed', query: {'limit': limit, 'sort': sort.code, 'cursor': ?cursor}), _url));

  @override
  Future<int> unreadCount() async {
    try {
      return asInt(asMap(await _get('/api/feed/unread-count'))['count']);
    } catch (_) {
      return 0;
    }
  }

  @override
  Future<void> markSeen() => _guard(() => _send('POST', '/api/feed/mark-seen', data: <String, dynamic>{}));

  @override
  Future<void> setLike(String postId, {required bool liked}) => _guard(() => _send(liked ? 'POST' : 'DELETE', '/api/posts/${Uri.encodeComponent(postId)}/like'));

  @override
  Future<void> repost(String postId, {String? caption}) =>
      _guard(() => _send('POST', '/api/posts/${Uri.encodeComponent(postId)}/repost', data: {if (caption != null && caption.trim().isNotEmpty) 'caption': caption.trim()}));

  @override
  Future<void> deletePost(String postId) => _guard(() => _send('DELETE', '/api/posts/${Uri.encodeComponent(postId)}'));

  @override
  Future<void> editPost(String postId, String caption) => _guard(() => _send('PATCH', '/api/posts/${Uri.encodeComponent(postId)}', data: {'caption': caption}));

  @override
  Future<void> createPost({required String caption, List<UploadFile> files = const [], void Function(double fraction)? onProgress}) => _guard(() async {
        if (files.isEmpty) {
          await _send('POST', '/api/posts', data: {'caption': caption.trim()});
          return;
        }
        final form = FormData.fromMap({
          if (caption.trim().isNotEmpty) 'caption': caption.trim(),
          'media': [for (final f in files) await MultipartFile.fromFile(f.path, filename: f.name)],
        });
        await session.dio.post<Object?>(
          '/api/posts',
          data: form,
          options: Options(sendTimeout: const Duration(minutes: 10), receiveTimeout: const Duration(minutes: 5)),
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call((sent / total).clamp(0.0, 1.0));
          },
        );
      });

  @override
  Future<List<FeedComment>> comments(String postId) =>
      _guard(() async => [for (final raw in asList(asMap(await _get('/api/posts/${Uri.encodeComponent(postId)}/comments'))['comments'])) ?FeedComment.tryParse(raw, _url)]);

  @override
  Future<FeedComment?> addComment(String postId, String text) => _guard(() async {
        final data = asMap(await _send('POST', '/api/posts/${Uri.encodeComponent(postId)}/comment', data: {'text': text}));
        final id = str(data['id']);
        if (id.isEmpty) return null;
        final me = session.user;
        return FeedComment(
          id: id,
          postId: postId,
          memberId: me?.id ?? 0,
          text: text,
          createdAt: DateTime.tryParse(str(data['created_at']))?.toLocal() ?? DateTime.now(),
          author: FeedAuthor(memberId: me?.id ?? 0, name: me?.displayName ?? '', avatarUrl: me?.avatarUrl == null || me!.avatarUrl!.isEmpty ? null : _url(me.avatarUrl!)),
        );
      });

  @override
  Future<void> deleteComment(String postId, String commentId) =>
      _guard(() => _send('DELETE', '/api/posts/${Uri.encodeComponent(postId)}/comments/${Uri.encodeComponent(commentId)}'));

  @override
  Future<void> setCommentLike(String postId, String commentId, {required bool liked}) =>
      _guard(() => _send(liked ? 'POST' : 'DELETE', '/api/posts/${Uri.encodeComponent(postId)}/comments/${Uri.encodeComponent(commentId)}/like'));

  @override
  Future<LikersPageData> likers(String postId, {String? cursor}) => _guard(() async {
        final m = asMap(await _get('/api/posts/${Uri.encodeComponent(postId)}/likes', query: {'limit': 40, 'cursor': ?cursor}));
        final next = str(m['next_cursor']).trim();
        return LikersPageData(
          likers: [for (final raw in asList(m['likers'])) ?Liker.tryParse(raw, _url)],
          total: asInt(m['total']),
          nextCursor: next.isEmpty ? null : next,
        );
      });

  @override
  Future<List<StoryGroup>> stories() => _guard(() async => [for (final raw in asList(asMap(await _get('/api/stories'))['groups'])) ?StoryGroup.tryParse(raw, _url)]);

  @override
  Future<void> createStory({required UploadFile file, String? caption, void Function(double fraction)? onProgress}) => _guard(() async {
        final form = FormData.fromMap({
          'media': await MultipartFile.fromFile(file.path, filename: file.name),
          if (caption != null && caption.trim().isNotEmpty) 'caption': caption.trim(),
        });
        await session.dio.post<Object?>(
          '/api/stories',
          data: form,
          options: Options(sendTimeout: const Duration(minutes: 10), receiveTimeout: const Duration(minutes: 5)),
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call((sent / total).clamp(0.0, 1.0));
          },
        );
      });

  @override
  Future<void> markStoryViewed(String storyId) => _guard(() => _send('POST', '/api/stories/${Uri.encodeComponent(storyId)}/view'));

  @override
  Future<void> deleteStory(String storyId) => _guard(() => _send('DELETE', '/api/stories/${Uri.encodeComponent(storyId)}'));

  @override
  Future<String> replyToStory(String storyId, {String? text, String? reaction}) => _guard(() async {
        final data = asMap(await _send('POST', '/api/stories/${Uri.encodeComponent(storyId)}/reply', data: {
          if (text != null && text.trim().isNotEmpty) 'text': text.trim(),
          if (reaction != null && reaction.trim().isNotEmpty) 'reaction': reaction.trim(),
        }));
        return str(data['conversationId']);
      });
}
