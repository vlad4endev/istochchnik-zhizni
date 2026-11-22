import 'package:molitva/features/service/editor/data/editor_source.dart';
import 'package:molitva/features/service/editor/models/editor_models.dart';
import 'package:molitva/features/service/models/plan_models.dart';

const song = BlockType(id: 1, code: 'song', name: 'Песня', kind: 'song');
const prayer = BlockType(id: 2, code: 'prayer', name: 'Молитва', kind: 'text');
const sermon = BlockType(id: 3, code: 'sermon', name: 'Проповедь', kind: 'speaker');
const custom = BlockType(id: 4, code: 'custom', name: 'Произвольный', kind: 'custom');

const anna = Member(id: 10, name: 'Анна Орлова', ministryRole: 'Ведущий', ministryDirection: '', appRole: 'member');
const petr = Member(id: 11, name: 'Пётр Сидоров', ministryRole: 'Проповедник', appRole: 'member');
const lena = Member(id: 12, name: 'Лена Музыка', ministryDirection: 'Музыкальное служение', appRole: 'musician');

EditorBlock block(int id, int typeId, {String title = 'Блок', int order = 0, int minutes = 5, int? assigned, int? songId, Map<String, dynamic> content = const {}}) =>
    EditorBlock(id: id, typeId: typeId, title: title, order: order, minutes: minutes, assignedId: assigned, songId: songId, content: content);

PlanDraft plan({List<EditorBlock>? blocks, bool published = false, int? preacher, int? music}) => PlanDraft(
      id: 7,
      date: DateTime(2026, 11, 22),
      startTime: '10:00',
      published: published,
      archived: false,
      preacherId: preacher,
      musicId: music,
      blocks: blocks ??
          [
            block(1, 2, title: 'Молитва', order: 0, minutes: 5),
            block(2, 1, title: 'Песня', order: 1, minutes: 10),
            block(3, 3, title: 'Проповедь', order: 2, minutes: 40, content: {'sermon_topic': 'Вера'}),
          ],
    );

class FakeEditor implements PlanEditorSource {
  FakeEditor(this.current);

  PlanDraft current;
  final List<String> log = [];
  final Map<int, Map<String, dynamic>> patched = {};
  final List<Map<String, dynamic>> planPatches = [];
  Object? failPatchBlock;
  Object? failDelete;
  Object? failReorder;
  Object? failPlanPatch;
  int nextId = 100;
  PublishResult publishResult = const PublishResult(notify: 'sent');

  @override
  Future<PlanDraft> plan(int id) async => current;

  @override
  Future<EditorLookups> lookups() async => const EditorLookups(types: [song, prayer, sermon, custom], members: [anna, petr, lena]);

  @override
  Future<List<SongChoice>> songs() async => const [SongChoice(id: 5, title: 'Великий Бог', key: 'G', number: 12)];

  @override
  Future<List<PlanTemplate>> templates() async => const [PlanTemplate(id: 1, name: 'Воскресное служение')];

  List<PlanSummary> archivedPlans = [];

  /// Шаблоны на «сервере»: id → шаблон.
  final Map<int, TemplateDraft> templateStore = {
    1: TemplateDraft(id: 1, name: 'Воскресное служение', description: 'Основное собрание', startTime: '10:00', active: true, rule: {'frequency': 'weekly', 'byWeekday': 0}, blocks: [block(11, 2, title: 'Молитва', order: 0), block(12, 1, title: 'Песня', order: 1, minutes: 10, assigned: 12)]),
    2: TemplateDraft(id: 2, name: 'Молодёжная встреча', description: '', startTime: '18:30', active: false, rule: {'frequency': 'weekly', 'byWeekday': 5}, blocks: [block(21, 3, title: 'Проповедь', order: 0, minutes: 30)]),
  };
  final List<Map<String, dynamic>> templateWrites = [];
  Object? failTemplateSave;

  @override
  Future<List<PlanTemplate>> allTemplates() async => [
        for (final t in templateStore.values) PlanTemplate(id: t.id, name: t.name, description: t.description, startTime: t.startTime, active: t.active, rule: t.rule),
      ];

  @override
  Future<TemplateDraft> template(int id) async => templateStore[id]!;

  @override
  Future<int> createTemplate(Map<String, dynamic> body) async {
    log.add('createTemplate');
    if (failTemplateSave != null) throw failTemplateSave!;
    templateWrites.add(body);
    return 50;
  }

  @override
  Future<void> patchTemplate(int id, Map<String, dynamic> body) async {
    log.add('patchTemplate $id');
    if (failTemplateSave != null) throw failTemplateSave!;
    templateWrites.add(body);
  }

  @override
  Future<void> deleteTemplate(int id) async => log.add('deleteTemplate $id');

  @override
  Future<List<PlanSummary>> archived() async => archivedPlans;

  @override
  Future<int> createPlan({required int templateId, required DateTime date}) async {
    log.add('createPlan $templateId');
    return 7;
  }

  @override
  Future<PublishResult> patchPlan(int id, Map<String, dynamic> body) async {
    log.add('patchPlan');
    if (failPlanPatch != null) throw failPlanPatch!;
    planPatches.add(body);
    return publishResult;
  }

  @override
  Future<void> deletePlan(int id) async => log.add('deletePlan');

  @override
  Future<int> createBlock({required int planId, required int typeId, required String title, required int minutes, Map<String, dynamic> content = const {}}) async {
    log.add('createBlock $title');
    return nextId++;
  }

  @override
  Future<void> patchBlock(int id, Map<String, dynamic> body) async {
    log.add('patchBlock $id');
    if (failPatchBlock != null) throw failPatchBlock!;
    patched[id] = body;
  }

  @override
  Future<void> deleteBlock(int id) async {
    log.add('deleteBlock $id');
    if (failDelete != null) throw failDelete!;
  }

  @override
  Future<void> reorder(int planId, List<int> orderedIds) async {
    log.add('reorder ${orderedIds.join(',')}');
    if (failReorder != null) throw failReorder!;
  }
}
