import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'json.dart';
import 'session.dart';

class ChurchApi {
  ChurchApi(this.session);
  final SessionController session;

  Future<Object?> get(String path, {Map<String, dynamic>? query}) async {
    final cacheKey = 'cache:$path:${query ?? const {}}';
    try {
      final response = await session.dio.get<Object?>(path, queryParameters: query);
      await _remember(cacheKey, response.data);
      return response.data;
    } on DioException {
      final cached = await _recall(cacheKey);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> _remember(String key, Object? data) async {
    if (data == null) return;
    try {
      final encoded = jsonEncode(data);
      if (encoded.length > 350000) return;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(key, encoded);
    } catch (_) {}
  }

  Future<Object?> _recall(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(key);
      if (raw == null || raw.isEmpty) return null;
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  Future<Object?> post(String path, {Object? data}) async {
    final response = await session.dio.post<Object?>(path, data: data);
    return response.data;
  }

  Future<Object?> delete(String path) async {
    final response = await session.dio.delete<Object?>(path);
    return response.data;
  }

  Future<Map<String, dynamic>> day(String iso) async => asMap(await get('/api/calendar/$iso'));

  Future<List<dynamic>> events() async => asList(await get('/api/calendar/events'));

  Future<Map<String, dynamic>> podcasts() async =>
      asMap(await get('/api/resources/podcasts', query: {'limit': 20}));

  Future<List<dynamic>> conversations() async => asList(await get('/api/messenger/conversations'));

  Future<int> unread() async => asInt(asMap(await get('/api/messenger/unread-count'))['count']);

  Future<List<dynamic>> messages(String id) async =>
      asList(await get('/api/messenger/conversations/$id/messages', query: {'limit': 50}));

  Future<void> sendMessage(
    String id,
    String content, {
    String payloadType = 'text',
    Map<String, dynamic>? payload,
  }) async {
    await post('/api/messenger/conversations/$id/messages', data: {
      'content': content,
      'payloadType': payloadType,
      'payload': ?payload,
    });
  }

  Future<Map<String, dynamic>> uploadChatFile({
    required String path,
    required String name,
    required String conversationId,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: name),
      'conversationId': conversationId,
      'originalFileName': name,
    });
    final response = await session.dio.post<Object?>('/api/messenger/upload', data: form);
    return asMap(response.data);
  }

  Future<List<dynamic>> searchMembers(String query) async =>
      asList(await get('/api/messenger/members/search', query: {'q': query, 'limit': 30}));

  Future<String> openPersonal(int otherMemberId) async {
    final data = asMap(await post('/api/messenger/conversations/personal', data: {'otherMemberId': otherMemberId}));
    return str(data['conversationId']);
  }

  Future<void> votePoll(String messageId, List<int> optionIndexes) async {
    await post('/api/messenger/messages/$messageId/poll-vote', data: {'optionIndexes': optionIndexes});
  }

  Future<Map<String, dynamic>> broadcast() async => asMap(await get('/api/broadcasts/active'));

  Future<Object?> broadcastHistory() async => get('/api/broadcasts/history');

  Future<Map<String, dynamic>> calls() async => asMap(await get('/api/calls/history', query: {'limit': 30}));

  Future<List<dynamic>> sermonNotes() async {
    final data = await get('/api/sermon-notes');
    if (data is List) return data;
    return asList(asMap(data)['notes'] ?? asMap(data)['items']);
  }

  Future<List<dynamic>> accessRequests() async =>
      asList(await get('/api/auth/access-requests', query: {'status': 'pending'}));

  Future<void> reviewRequest(int id, {required bool approve}) async {
    await post('/api/auth/access-requests/$id/${approve ? 'approve' : 'reject'}');
  }

  Future<AppUser> patchMe(Map<String, dynamic> body) async {
    final response = await session.dio.patch<Object?>('/api/auth/me', data: body);
    final next = AppUser.fromJson(asMap(response.data));
    await session.replaceUser(next);
    return next;
  }

  Future<AppUser> uploadAvatar(String path, String name) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(path, filename: name),
    });
    final response = await session.dio.post<Object?>('/api/auth/me/avatar', data: form);
    final next = AppUser.fromJson(asMap(response.data));
    await session.replaceUser(next);
    return next;
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await post('/api/auth/change-password', data: {
      'current_password': currentPassword,
      'new_password': newPassword,
    });
  }

  Future<Map<String, dynamic>> saveSermonNote({
    String? id,
    required String title,
    required String topic,
    required String scripture,
    required String body,
  }) async {
    final payload = {
      'title': title,
      'topic': topic,
      'scripture': scripture,
      'body': body,
      'body_format': 'plain',
    };
    if (id == null || id.isEmpty) {
      return asMap(await post('/api/sermon-notes', data: payload));
    }
    final response = await session.dio.patch<Object?>('/api/sermon-notes/$id', data: payload);
    return asMap(response.data);
  }

  Future<Map<String, dynamic>> createCall({
    required String type,
    required String mediaType,
    String conversationId = '',
    int? recipientId,
    String? accessMode,
    bool standalone = false,
    String? title,
  }) async {
    return asMap(await post('/api/calls', data: {
      'type': type,
      'mediaType': mediaType,
      if (conversationId.isNotEmpty) 'conversationId': conversationId,
      'recipientId': ?recipientId,
      'accessMode': ?accessMode,
      if (standalone) 'standalone': true,
      'title': ?title,
    }));
  }

  Future<Map<String, dynamic>> invitationPreview(String token) async =>
      asMap(await get('/api/call-invitations/${Uri.encodeComponent(token)}'));

  Future<Map<String, dynamic>> joinInvitation(String token) async =>
      asMap(await post('/api/call-invitations/${Uri.encodeComponent(token)}/join'));

  /// Звонок целиком (`status`, `title`, `inviteUrl`, `mediaType`, `conversationId`…).
  Future<Map<String, dynamic>> callDetails(String callId) async => asMap(asMap(await get('/api/calls/$callId'))['call']);

  /// Состояние звонка на сервере (`status`: ringing, active, declined, ended…).
  Future<String> callStatus(String callId) async => str((await callDetails(callId))['status']);

  Future<Map<String, dynamic>> callToken(String callId) async =>
      asMap(await post('/api/calls/$callId/token'));

  Future<void> acceptCall(String callId) async {
    await post('/api/calls/$callId/accept');
  }

  Future<void> declineCall(String callId) async {
    await post('/api/calls/$callId/decline');
  }

  /// [endForAll] — завершить встречу для всех (может только организатор); иначе просто выйти.
  Future<void> endCall(String callId, {bool endForAll = true}) async {
    await post('/api/calls/$callId/end', data: {'endForAll': endForAll});
  }
}

String describeDio(Object error) {
  if (error is DioException) return readApiError(error);
  return 'Не удалось загрузить данные';
}
