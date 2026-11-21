import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../logic/ministry_access.dart';
import '../models/schedule_models.dart';

/// Сервер сказал «нет доступа» (403): служение скрываем, а не показываем ошибку.
class NoAccessException implements Exception {
  const NoAccessException(this.ministry);
  final Ministry ministry;
}

/// Ответ «моего» расписания; [staleSince] — если сети не было и показана сохранённая копия.
class MineResult<T> {
  const MineResult(this.items, {this.staleSince});
  final List<T> items;
  final DateTime? staleSince;
}

String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Откуда экран расписания берёт данные. Отдельный интерфейс — чтобы проверять без сети.
abstract class ScheduleSource {
  Future<MineResult<ScheduleEvent>> myEvents(Ministry ministry, DateTime from, DateTime to);
  Future<MineResult<SundayPlan>> mySunday(DateTime from, DateTime to);
  Future<List<ScheduleEvent>> events(Ministry ministry, DateTime from, DateTime to);
  Future<List<SundayPlan>> sundayPlans(DateTime from, DateTime to);
  Future<List<ScheduleRole>> roles(Ministry ministry);
  Future<List<PersonRef>> members(Ministry ministry, {int? roleId});
  Future<List<PersonRef>> sundayMembers();
  Future<void> assign(Ministry ministry, {required int planId, required int memberId, required int roleId});
  Future<void> removeAssignment(Ministry ministry, int assignmentId);
  Future<void> setStatus(Ministry ministry, int assignmentId, AssignmentStatus status);

  /// Меняет ведущего и/или проповедника; `null` в паре «поле + флаг» снимает назначение.
  Future<void> saveSunday(SundayPlan plan, {bool setLeader = false, int? leaderId, bool setPreacher = false, int? preacherId});
}

String _base(Ministry m) => m == Ministry.media ? '/api/media-schedule' : '/api/music-schedule';

class ScheduleRepository implements ScheduleSource {
  ScheduleRepository(this.session, {Future<Directory?> Function()? cacheDirectory}) : _cacheDirectory = cacheDirectory ?? _defaultDirectory;

  final SessionController session;
  final Future<Directory?> Function() _cacheDirectory;

  static Future<Directory?> _defaultDirectory() async {
    try {
      return await getApplicationSupportDirectory();
    } catch (_) {
      return null;
    }
  }

  Future<T> _guard<T>(Ministry m, Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) throw NoAccessException(m);
      rethrow;
    }
  }

  // ——— копия «моего» расписания: открывается без сети ———

  Future<File?> _cacheFile(String name) async {
    final dir = await _cacheDirectory();
    final user = session.user?.id;
    if (dir == null || user == null) return null;
    return File('${dir.path}/schedule_${name}_$user.json');
  }

  Future<void> _writeCache(String name, List<dynamic> raw) async {
    try {
      final file = await _cacheFile(name);
      if (file == null) return;
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode({'origin': session.apiOrigin, 'savedAt': DateTime.now().toIso8601String(), 'items': raw}), flush: true);
      await tmp.rename(file.path);
    } catch (_) {}
  }

  Future<({List<dynamic> items, DateTime savedAt})?> _readCache(String name) async {
    try {
      final file = await _cacheFile(name);
      if (file == null || !await file.exists()) return null;
      final data = asMap(jsonDecode(await file.readAsString()));
      if (str(data['origin']) != session.apiOrigin) return null;
      return (items: asList(data['items']), savedAt: DateTime.tryParse(str(data['savedAt'])) ?? DateTime.now());
    } catch (_) {
      return null;
    }
  }

  /// После выхода чужое расписание на телефоне не оставляем.
  static Future<void> clearAll() async {
    try {
      final dir = await _defaultDirectory();
      if (dir == null) return;
      await for (final entity in dir.list()) {
        if (entity is File && entity.uri.pathSegments.last.startsWith('schedule_')) await entity.delete();
      }
    } catch (_) {}
  }

  List<ScheduleEvent> _events(Ministry m, List<dynamic> raw) =>
      [for (final item in raw) ?ScheduleEvent.fromJson(m, asMap(item))];

  @override
  Future<MineResult<ScheduleEvent>> myEvents(Ministry ministry, DateTime from, DateTime to) async {
    try {
      final response = await _guard(
        ministry,
        () => session.dio.get<Object?>('${_base(ministry)}/my-schedule', queryParameters: {'from': ymd(from), 'to': ymd(to)}),
      );
      final raw = asList(asMap(response.data)['events']);
      await _writeCache('mine_${ministry.name}', raw);
      return MineResult(_events(ministry, raw));
    } on NoAccessException {
      rethrow;
    } catch (_) {
      final cached = await _readCache('mine_${ministry.name}');
      if (cached == null) rethrow;
      return MineResult(_events(ministry, cached.items), staleSince: cached.savedAt);
    }
  }

  @override
  Future<MineResult<SundayPlan>> mySunday(DateTime from, DateTime to) async {
    try {
      final response = await _guard(
        Ministry.sunday,
        () => session.dio.get<Object?>('/api/sunday-schedule/my', queryParameters: {'from': ymd(from), 'to': ymd(to)}),
      );
      final raw = asList(response.data);
      await _writeCache('mine_sunday', raw);
      return MineResult([for (final item in raw) ?SundayPlan.fromJson(asMap(item))]);
    } on NoAccessException {
      rethrow;
    } catch (_) {
      final cached = await _readCache('mine_sunday');
      if (cached == null) rethrow;
      return MineResult([for (final item in cached.items) ?SundayPlan.fromJson(asMap(item))], staleSince: cached.savedAt);
    }
  }

  @override
  Future<List<ScheduleEvent>> events(Ministry ministry, DateTime from, DateTime to) async {
    final response = await _guard(
      ministry,
      () => session.dio.get<Object?>('${_base(ministry)}/events', queryParameters: {'from': ymd(from), 'to': ymd(to)}),
    );
    return _events(ministry, asList(asMap(response.data)['events']));
  }

  @override
  Future<List<SundayPlan>> sundayPlans(DateTime from, DateTime to) async {
    final response = await _guard(
      Ministry.sunday,
      () => session.dio.get<Object?>('/api/sunday-schedule/plans', queryParameters: {'from': ymd(from), 'to': ymd(to)}),
    );
    return [for (final item in asList(response.data)) ?SundayPlan.fromJson(asMap(item))];
  }

  @override
  Future<List<ScheduleRole>> roles(Ministry ministry) async {
    final response = await _guard(ministry, () => session.dio.get<Object?>('${_base(ministry)}/roles'));
    final list = [
      for (final raw in asList(asMap(response.data)['roles']))
        if (asMap(raw)['is_active'] != false) ScheduleRole.fromJson(asMap(raw)),
    ];
    list.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return list;
  }

  @override
  Future<List<PersonRef>> members(Ministry ministry, {int? roleId}) async {
    final response = await _guard(
      ministry,
      () => session.dio.get<Object?>('${_base(ministry)}/members', queryParameters: {if (roleId != null && roleId > 0) 'role_id': roleId}),
    );
    return [for (final raw in asList(asMap(response.data)['members'])) PersonRef.fromJson(asMap(raw))];
  }

  @override
  Future<List<PersonRef>> sundayMembers() async {
    final response = await _guard(Ministry.sunday, () => session.dio.get<Object?>('/api/sunday-schedule/members'));
    return [for (final raw in asList(response.data)) PersonRef.fromJson(asMap(raw))];
  }

  @override
  Future<void> assign(Ministry ministry, {required int planId, required int memberId, required int roleId}) async {
    await _guard(
      ministry,
      () => session.dio.post<Object?>('${_base(ministry)}/events/$planId/assign', data: {'member_id': memberId, 'role_id': roleId}),
    );
  }

  @override
  Future<void> removeAssignment(Ministry ministry, int assignmentId) async {
    await _guard(ministry, () => session.dio.delete<Object?>('${_base(ministry)}/assignments/$assignmentId'));
  }

  @override
  Future<void> setStatus(Ministry ministry, int assignmentId, AssignmentStatus status) async {
    if (status != AssignmentStatus.confirmed && status != AssignmentStatus.declined) {
      throw ArgumentError('Ответить можно только «подтвердить» или «отказаться»');
    }
    await _guard(
      ministry,
      () => session.dio.patch<Object?>('${_base(ministry)}/assignments/$assignmentId/status', data: {'status': status.name}),
    );
  }

  @override
  Future<void> saveSunday(SundayPlan plan, {bool setLeader = false, int? leaderId, bool setPreacher = false, int? preacherId}) async {
    final body = {
      if (setLeader) 'leader_member_id': leaderId,
      if (setPreacher) 'preacher_member_id': preacherId,
    };
    final path = plan.id > 0 ? '/api/sunday-schedule/plans/${plan.id}' : '/api/sunday-schedule/dates/${ymd(plan.date)}';
    await _guard(Ministry.sunday, () => session.dio.patch<Object?>(path, data: body));
  }
}
