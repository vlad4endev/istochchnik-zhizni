import 'package:dio/dio.dart';

import 'json.dart';
import 'session.dart';

class ChurchApi {
  ChurchApi(this.session);
  final SessionController session;

  Future<Object?> get(String path, {Map<String, dynamic>? query}) async {
    final response = await session.dio.get<Object?>(path, queryParameters: query);
    return response.data;
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

  Future<Map<String, dynamic>> feed() async => asMap(await get('/api/feed', query: {'limit': 20}));

  Future<Map<String, dynamic>> stories() async => asMap(await get('/api/stories'));

  Future<List<dynamic>> books() async =>
      asList(asMap(await get('/api/bible/books', query: {'translation': 'synodal'}))['books']);

  Future<Map<String, dynamic>> chapter(String book, int chapter) async => asMap(
        await get('/api/bible/chapter/synodal/$book/$chapter'),
      );

  Future<List<dynamic>> songs(String query) async =>
      asList(await get('/api/songs', query: query.trim().isEmpty ? null : {'q': query.trim()}));

  Future<Map<String, dynamic>> song(String id) async => asMap(await get('/api/songs/$id'));

  Future<List<dynamic>> conversations() async => asList(await get('/api/messenger/conversations'));

  Future<int> unread() async => asInt(asMap(await get('/api/messenger/unread-count'))['count']);

  Future<List<dynamic>> messages(String id) async =>
      asList(await get('/api/messenger/conversations/$id/messages', query: {'limit': 50}));

  Future<void> sendMessage(String id, String content) async {
    await post('/api/messenger/conversations/$id/messages', data: {
      'content': content,
      'payloadType': 'text',
    });
  }

  Future<List<dynamic>> plans() async => asList(await get('/api/service-plans'));

  Future<Map<String, dynamic>> plan(String id) async => asMap(await get('/api/service-plans/$id'));

  Future<List<dynamic>> setlists() async => asList(await get('/api/studio/setlists'));

  Future<List<dynamic>> setlistItems(String id) async =>
      asList(await get('/api/studio/setlists/$id/items'));

  Future<List<dynamic>> mediaMine(String from, String to) async =>
      asList(asMap(await get('/api/media-schedule/my-schedule', query: {'from': from, 'to': to}))['events']);

  Future<List<dynamic>> musicMine(String from, String to) async =>
      asList(asMap(await get('/api/music-schedule/my-schedule', query: {'from': from, 'to': to}))['events']);

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

  Future<void> like(String postId, {required bool liked}) async {
    if (liked) {
      await delete('/api/posts/$postId/like');
    } else {
      await post('/api/posts/$postId/like');
    }
  }

  Future<List<dynamic>> comments(String postId) async =>
      asList(asMap(await get('/api/posts/$postId/comments'))['comments']);
}

String describeDio(Object error) {
  if (error is DioException) return readApiError(error);
  return 'Не удалось загрузить данные';
}
