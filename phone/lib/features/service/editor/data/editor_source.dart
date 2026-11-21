import '../../../../core/json.dart';
import '../../../../core/session.dart';
import '../../models/plan_models.dart' show PlanSummary;
import '../models/editor_models.dart';

/// Песня для выбора в блоке.
class SongChoice {
  const SongChoice({required this.id, required this.title, this.key, this.number});

  final int id;
  final String title;
  final String? key;
  final int? number;
}

/// Всё, что нужно редактору кроме самой программы.
class EditorLookups {
  const EditorLookups({required this.types, required this.members, this.songs = const []});

  final List<BlockType> types;
  final List<Member> members;
  final List<SongChoice> songs;

  Map<int, BlockType> get typesById => {for (final t in types) t.id: t};
  Map<int, Member> get membersById => {for (final m in members) m.id: m};
}

class PublishResult {
  const PublishResult({this.notify, this.setlistSongs, this.setlistCreated});

  /// sent | skipped | failed | null
  final String? notify;
  final int? setlistSongs;
  final bool? setlistCreated;
}

abstract class PlanEditorSource {
  Future<PlanDraft> plan(int id);
  Future<EditorLookups> lookups();
  Future<List<SongChoice>> songs();
  Future<List<PlanTemplate>> templates();
  Future<List<PlanSummary>> archived();

  Future<int> createPlan({required int templateId, required DateTime date});
  Future<PublishResult> patchPlan(int id, Map<String, dynamic> body);
  Future<void> deletePlan(int id);

  Future<int> createBlock({required int planId, required int typeId, required String title, required int minutes, Map<String, dynamic> content});
  Future<void> patchBlock(int id, Map<String, dynamic> body);
  Future<void> deleteBlock(int id);
  Future<void> reorder(int planId, List<int> orderedIds);
}

class PlanEditorApi implements PlanEditorSource {
  PlanEditorApi(this.session);

  final SessionController session;

  Future<Object?> _get(String path, {Map<String, dynamic>? query}) async => (await session.dio.get<Object?>(path, queryParameters: query)).data;

  @override
  Future<PlanDraft> plan(int id) async {
    final plan = PlanDraft.fromJson(asMap(await _get('/api/service-plans/$id')));
    if (plan == null) throw StateError('Программа не найдена');
    return plan;
  }

  @override
  Future<EditorLookups> lookups() async {
    final types = [
      for (final raw in asList(await _get('/api/service-block-types')))
        ?BlockType.fromJson(asMap(raw)),
    ];
    var members = const <Member>[];
    try {
      members = [
        for (final raw in asList(await _get('/api/service-planner-members')))
          ?Member.fromJson(asMap(raw)),
      ];
    } catch (_) {
      /* справочник людей доступен не всем — редактор откроется без выбора ответственных */
    }
    return EditorLookups(types: types, members: members);
  }

  @override
  Future<List<SongChoice>> songs() async {
    return [
      for (final raw in asList(await _get('/api/songs')))
        if (asInt(asMap(raw)['id']) > 0 && str(asMap(raw)['title']).isNotEmpty)
          SongChoice(
            id: asInt(asMap(raw)['id']),
            title: str(asMap(raw)['title']),
            key: str(asMap(raw)['default_key']).trim().isEmpty ? null : str(asMap(raw)['default_key']).trim(),
            number: asInt(asMap(raw)['song_number']) > 0 ? asInt(asMap(raw)['song_number']) : null,
          ),
    ];
  }

  @override
  Future<List<PlanTemplate>> templates() async => [
        for (final raw in asList(await _get('/api/service-templates')))
          ?PlanTemplate.fromJson(asMap(raw)),
      ];

  @override
  Future<List<PlanSummary>> archived() async => [
        for (final raw in asList(await _get('/api/service-plans', query: {'include_archived': true})))
          if (asMap(raw)['is_archived'] == true) ?PlanSummary.fromJson(asMap(raw)),
      ]..sort((a, b) => b.date.compareTo(a.date));

  @override
  Future<int> createPlan({required int templateId, required DateTime date}) async {
    final d = '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final data = asMap((await session.dio.post<Object?>('/api/service-plans', data: {'template_id': templateId, 'service_date': d, 'leader_member_id': null, 'preacher_member_id': null})).data);
    final id = asInt(data['id']);
    if (id <= 0) throw StateError('Сервер не вернул программу');
    return id;
  }

  @override
  Future<PublishResult> patchPlan(int id, Map<String, dynamic> body) async {
    final data = asMap((await session.dio.patch<Object?>('/api/service-plans/$id', data: body)).data);
    final setlists = asMap(data['setlists']);
    final first = asList(setlists['items']).isEmpty ? null : asMap(asList(setlists['items']).first);
    return PublishResult(
      notify: data['published_notify'] == null ? null : str(data['published_notify']),
      setlistSongs: first == null ? null : asInt(first['song_count']),
      setlistCreated: first == null ? null : first['created'] == true,
    );
  }

  @override
  Future<void> deletePlan(int id) async {
    await session.dio.delete<Object?>('/api/service-plans/$id');
  }

  @override
  Future<int> createBlock({required int planId, required int typeId, required String title, required int minutes, Map<String, dynamic> content = const {}}) async {
    final data = asMap((await session.dio.post<Object?>('/api/service-blocks', data: {
      'service_plan_id': planId,
      'block_type_id': typeId,
      'title': title,
      'duration_minutes': minutes,
      'content_json': content,
    })).data);
    final id = asInt(data['id']);
    if (id <= 0) throw StateError('Сервер не создал блок');
    return id;
  }

  @override
  Future<void> patchBlock(int id, Map<String, dynamic> body) async {
    await session.dio.patch<Object?>('/api/service-blocks/$id', data: body);
  }

  @override
  Future<void> deleteBlock(int id) async {
    await session.dio.delete<Object?>('/api/service-blocks/$id');
  }

  @override
  Future<void> reorder(int planId, List<int> orderedIds) async {
    await session.dio.patch<Object?>('/api/service-blocks/reorder', data: {'service_plan_id': planId, 'ordered_block_ids': orderedIds});
  }
}
