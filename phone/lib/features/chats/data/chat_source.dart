import 'package:dio/dio.dart' show DioException, FormData, MultipartFile, Options;

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/chat_models.dart';

/// Всё, что экран чата берёт с сервера. Интерфейс нужен тестам: контроллер не знает про Dio.
abstract class ChatSource {
  Future<List<ChatMessage>> messages(String conversationId, {String? before, int limit = 50});
  Future<ChatMessage?> send(String conversationId, String text, {String? replyTo, String payloadType = 'text', Map<String, dynamic>? payload});
  Future<void> edit(String messageId, String content);
  Future<void> delete(String messageId);
  Future<void> react(String messageId, String emoji, {required bool add});
  Future<void> vote(String messageId, List<int> options);
  Future<void> forward(String messageId, List<String> conversationIds);
  Future<List<ChatMember>> members(String conversationId);
  Future<ChatMeta> meta(String conversationId);
  Future<PrivateProfile> privateProfile(String conversationId);
  Future<LinkPreview?> linkPreview(String url);
  Future<Readers> readers(String messageId);
  Future<void> setMuted(String conversationId, bool muted);
  Future<void> pin(String conversationId, String messageId, {required bool pinned});
  Future<List<Map<String, dynamic>>> conversations();
  /// Загрузить файл на сервер; [onProgress] — доля от 0 до 1. Ошибку отдаёт как [ChatException] с понятным текстом.
  Future<Map<String, dynamic>> upload({required String path, required String name, required String conversationId, void Function(double fraction)? onProgress});
}

/// Сервер или сеть отказали; [message] можно показывать человеку.
class ChatException implements Exception {
  const ChatException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ChatApi implements ChatSource {
  ChatApi(this.session);
  final SessionController session;

  static const _base = '/api/messenger';

  Future<Object?> _get(String path, {Map<String, dynamic>? query}) async =>
      (await session.dio.get<Object?>(path, queryParameters: query)).data;

  Future<Object?> _send(String method, String path, {Object? data}) async =>
      (await session.dio.request<Object?>(path, data: data, options: Options(method: method))).data;

  @override
  Future<List<ChatMessage>> messages(String conversationId, {String? before, int limit = 50}) async {
    final data = await _get('$_base/conversations/$conversationId/messages', query: {'limit': limit, 'before': ?before});
    return [for (final raw in asList(data)) ?ChatMessage.tryParse(raw)];
  }

  @override
  Future<ChatMessage?> send(String conversationId, String text, {String? replyTo, String payloadType = 'text', Map<String, dynamic>? payload}) async {
    final data = await _send('POST', '$_base/conversations/${Uri.encodeComponent(conversationId)}/messages', data: {
      'content': text,
      'replyToMessageId': ?replyTo,
      if (payloadType != 'text') 'payloadType': payloadType,
      'payload': ?payload,
    });
    return ChatMessage.tryParse(data);
  }

  @override
  Future<void> edit(String messageId, String content) async {
    await _send('PATCH', '$_base/messages/$messageId', data: {'content': content});
  }

  @override
  Future<void> delete(String messageId) async {
    await _send('DELETE', '$_base/messages/$messageId');
  }

  @override
  Future<void> react(String messageId, String emoji, {required bool add}) async {
    if (add) {
      await _send('POST', '$_base/messages/$messageId/reactions', data: {'emoji': emoji});
    } else {
      await _send('DELETE', '$_base/messages/$messageId/reactions/${Uri.encodeComponent(emoji)}');
    }
  }

  @override
  Future<void> vote(String messageId, List<int> options) async {
    await _send('POST', '$_base/messages/$messageId/poll-vote', data: {'optionIndexes': options});
  }

  @override
  Future<void> forward(String messageId, List<String> conversationIds) async {
    await _send('POST', '$_base/messages/${Uri.encodeComponent(messageId)}/forward', data: {'conversationIds': conversationIds});
  }

  @override
  Future<List<ChatMember>> members(String conversationId) async =>
      [for (final raw in asList(await _get('$_base/conversations/$conversationId/members'))) ?ChatMember.tryParse(raw)];

  @override
  Future<ChatMeta> meta(String conversationId) async => ChatMeta.fromJson(await _get('$_base/conversations/$conversationId/meta'));

  @override
  Future<PrivateProfile> privateProfile(String conversationId) async =>
      PrivateProfile.fromJson(await _get('$_base/conversations/$conversationId/private-profile'));

  @override
  Future<LinkPreview?> linkPreview(String url) async => LinkPreview.tryParse(await _get('$_base/link-preview', query: {'url': url}));

  @override
  Future<Readers> readers(String messageId) async => Readers.fromJson(await _get('$_base/messages/${Uri.encodeComponent(messageId)}/readers'));

  @override
  Future<void> setMuted(String conversationId, bool muted) async {
    await _send('PATCH', '$_base/conversations/${Uri.encodeComponent(conversationId)}/my-ui', data: {'muted': muted});
  }

  @override
  Future<void> pin(String conversationId, String messageId, {required bool pinned}) async {
    final base = '$_base/conversations/${Uri.encodeComponent(conversationId)}/pins';
    if (pinned) {
      await _send('POST', base, data: {'messageId': messageId});
    } else {
      await _send('DELETE', '$base/${Uri.encodeComponent(messageId)}');
    }
  }

  @override
  Future<List<Map<String, dynamic>>> conversations() async =>
      [for (final raw in asList(await _get('$_base/conversations'))) asMap(raw)];

  @override
  Future<Map<String, dynamic>> upload({
    required String path,
    required String name,
    required String conversationId,
    void Function(double fraction)? onProgress,
  }) async {
    // Как на сайте: до трёх попыток; а загрузка видео может идти долго, поэтому таймауты большие
    // (обычные 25 секунд обрывали бы загрузку, пока сервер сохраняет файл в хранилище).
    const attempts = 3;
    Object? last;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        final form = FormData.fromMap({
          'file': await MultipartFile.fromFile(path, filename: name),
          'conversationId': conversationId,
          'originalFileName': name,
        });
        final response = await session.dio.post<Object?>(
          '$_base/upload',
          data: form,
          options: Options(sendTimeout: const Duration(hours: 1), receiveTimeout: const Duration(minutes: 10)),
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call((sent / total).clamp(0.0, 1.0));
          },
        );
        return asMap(response.data);
      } on DioException catch (e) {
        last = e;
        final status = e.response?.statusCode ?? 0;
        // Ответ сервера «нельзя» (слишком большой, нет доступа, нет хранилища) повтором не лечится.
        if (status >= 400 && status < 500) break;
        if (attempt < attempts) await Future<void>.delayed(Duration(milliseconds: 400 * attempt));
      } catch (e) {
        last = e;
        break;
      }
    }
    throw ChatException(last is DioException ? readApiError(last) : 'Не удалось прочитать файл');
  }
}
