import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/plan_models.dart';

/// Результат с признаком «показана сохранённая копия».
class Loaded<T> {
  const Loaded(this.value, {this.staleSince});
  final T value;
  final DateTime? staleSince;
}

abstract class PlanSource {
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to);
  Future<Loaded<PlanView>> view(PlanSummary plan);
}

String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Программа лежит и в файле на телефоне: в церкви может не быть связи, а программа нужна именно там.
class PlanRepository implements PlanSource {
  PlanRepository(this.session, {Future<Directory?> Function()? cacheDirectory}) : _cacheDirectory = cacheDirectory ?? _defaultDirectory;

  final SessionController session;
  final Future<Directory?> Function() _cacheDirectory;

  static Future<Directory?> _defaultDirectory() async {
    try {
      return await getApplicationSupportDirectory();
    } catch (_) {
      return null;
    }
  }

  Future<File?> _file(String name) async {
    final dir = await _cacheDirectory();
    final user = session.user?.id;
    if (dir == null || user == null) return null;
    return File('${dir.path}/service_${name}_$user.json');
  }

  Future<void> _write(String name, Object data) async {
    try {
      final file = await _file(name);
      if (file == null) return;
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode({'origin': session.apiOrigin, 'savedAt': DateTime.now().toIso8601String(), 'data': data}), flush: true);
      await tmp.rename(file.path);
    } catch (_) {}
  }

  Future<({Object? data, DateTime savedAt})?> _read(String name) async {
    try {
      final file = await _file(name);
      if (file == null || !await file.exists()) return null;
      final json = asMap(jsonDecode(await file.readAsString()));
      if (str(json['origin']) != session.apiOrigin) return null;
      return (data: json['data'], savedAt: DateTime.tryParse(str(json['savedAt'])) ?? DateTime.now());
    } catch (_) {
      return null;
    }
  }

  /// После выхода чужие программы на телефоне не оставляем.
  static Future<void> clearAll() async {
    try {
      final dir = await _defaultDirectory();
      if (dir == null) return;
      await for (final entity in dir.list()) {
        if (entity is File && entity.uri.pathSegments.last.startsWith('service_')) await entity.delete();
      }
    } catch (_) {}
  }

  List<PlanSummary> _summaries(Object? raw) => [for (final item in asList(raw)) ?PlanSummary.fromJson(asMap(item))];

  @override
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to) async {
    try {
      final response = await session.dio.get<Object?>('/api/service-plans', queryParameters: {'from': _ymd(from), 'to': _ymd(to)});
      final raw = asList(response.data);
      await _write('list', raw);
      return Loaded(_summaries(raw));
    } catch (_) {
      final cached = await _read('list');
      if (cached == null) rethrow;
      return Loaded(_summaries(cached.data), staleSince: cached.savedAt);
    }
  }

  @override
  Future<Loaded<PlanView>> view(PlanSummary plan) async {
    // 1. Публичная программа по ссылке: в ней уже есть названия песен, имена и команда трансляции.
    if (plan.shareToken.isNotEmpty) {
      try {
        final response = await session.dio.get<Object?>('/api/public/service-plans/${Uri.encodeComponent(plan.shareToken)}');
        final payload = asMap(response.data);
        if (asList(payload['blocks']).isNotEmpty || asMap(payload['plan']).isNotEmpty) {
          await _write('plan_${plan.id}', payload);
          return Loaded(viewFromPublic(plan, payload));
        }
      } catch (_) {
        /* срок ссылки мог истечь или нет сети — пробуем остальное */
      }
    }
    // 2. Данные плана: имена достаём из справочников, если права позволяют.
    try {
      return Loaded(await _viewFromDetails(plan));
    } catch (_) {
      final cached = await _read('plan_${plan.id}');
      if (cached == null) rethrow;
      return Loaded(viewFromPublic(plan, asMap(cached.data)), staleSince: cached.savedAt);
    }
  }

  Future<PlanView> _viewFromDetails(PlanSummary plan) async {
    final details = asMap((await session.dio.get<Object?>('/api/service-plans/${plan.id}')).data);
    final typeNames = <int, String>{};
    final memberNames = <int, String>{};
    try {
      final types = asList((await session.dio.get<Object?>('/api/service-block-types')).data);
      for (final t in types) {
        typeNames[asInt(asMap(t)['id'])] = str(asMap(t)['name']);
      }
    } catch (_) {}
    try {
      final members = asList((await session.dio.get<Object?>('/api/service-planner-members')).data);
      for (final m in members) {
        final json = asMap(m);
        final full = '${str(json['first_name'])} ${str(json['last_name'])}'.trim();
        memberNames[asInt(json['id'])] = full.isNotEmpty ? full : str(json['name']);
      }
    } catch (_) {
      /* обычному участнику справочник недоступен — покажем без имён */
    }
    var broadcast = const <BroadcastPerson>[];
    try {
      final assignments = asList(asMap((await session.dio.get<Object?>('/api/media-schedule/plans/${plan.id}/assignments')).data)['assignments']);
      broadcast = broadcastFromJson([
        for (final a in assignments)
          {'role_name': asMap(asMap(a)['role'])['name'], 'role_color': asMap(asMap(a)['role'])['color'], 'member_name': asMap(asMap(a)['member'])['name']},
      ]);
    } catch (_) {}
    final blocks = [for (final raw in asList(details['blocks'])) blockFromJson(asMap(raw), typeNames: typeNames, memberNames: memberNames)];
    return PlanView(
      summary: plan,
      blocks: blocks,
      notes: str(details['notes']).trim(),
      leaderName: memberNames[plan.leaderId] ?? '',
      preacherName: memberNames[plan.preacherId] ?? '',
      broadcast: broadcast,
      sermon: sermonFromJson(details['linked_sermon_note']),
      namesComplete: false,
    );
  }
}

PlanView viewFromPublic(PlanSummary summary, Map<String, dynamic> payload) {
  final plan = asMap(payload['plan']);
  final blocks = [for (final raw in asList(payload['blocks'])) blockFromJson(asMap(raw))]..sort((a, b) => a.order.compareTo(b.order));
  return PlanView(
    summary: summary,
    blocks: blocks,
    notes: str(plan['notes']).trim(),
    leaderName: str(plan['leader_name']).trim(),
    preacherName: str(plan['preacher_name']).trim(),
    broadcast: broadcastFromJson(payload['broadcast_assignments']),
    sermon: sermonFromJson(payload['linked_sermon_note']),
  );
}

/// Ошибка «нет такого плана» — отдельно от сети, чтобы сказать человеку правду.
bool isNotFound(Object error) => error is DioException && error.response?.statusCode == 404;
