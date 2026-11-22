import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/service/editor/logic/editor_logic.dart';
import 'package:molitva/features/service/editor/models/editor_models.dart';
import 'package:molitva/features/service/editor/template_editor_controller.dart';

import 'fake_editor.dart';

Future<(TemplateEditorController, FakeEditor)> _open({int? id}) async {
  final f = FakeEditor(plan());
  final c = TemplateEditorController(f, templateId: id);
  addTearDown(c.dispose);
  await c.load();
  return (c, f);
}

void main() {
  group('логика шаблонов', () {
    test('правило повтора: день недели и подпись', () {
      expect(ruleWeekday({'frequency': 'weekly', 'byWeekday': 0}), 0);
      expect(ruleWeekday({'frequency': 'weekly', 'byWeekday': '5'}), 5);
      expect(ruleWeekday({'frequency': 'daily'}), isNull);
      expect(ruleWeekday({'frequency': 'weekly', 'byWeekday': 9}), isNull);
      expect(ruleSummary(weeklyRule(0)), 'Каждую неделю: воскресенье');
      expect(ruleSummary(const {}), 'Без повтора');
      expect(ruleSummary({'frequency': 'monthly'}), 'Своё правило (задано на сайте)');
    });

    test('тело запроса: порядок по списку, ответственный в default_content_json, минимум 1 минута', () {
      final t = TemplateDraft(id: 0, name: ' Служение ', description: ' ', startTime: '10:00', active: true, rule: weeklyRule(0), blocks: [
        block(-1, 2, title: 'Б', order: 5, minutes: 0),
        block(-2, 1, title: '', order: 1, minutes: 7, assigned: 12, songId: 5),
      ]);
      final body = templatePayload(t, withActive: true);
      expect(body['name'], 'Служение');
      expect(body['description'], isNull);
      expect(body['is_active'], true);
      final blocks = body['blocks'] as List;
      expect(blocks[0]['title'], 'Блок 1', reason: 'пустое название заменяется');
      expect(blocks[0]['default_song_id'], 5);
      expect(blocks[0]['default_content_json']['default_assigned_member_id'], 12);
      expect(blocks[1]['title'], 'Б');
      expect(blocks[1]['duration_minutes'], 1);
      expect([for (final b in blocks) b['order_index']], [0, 1]);
      expect(templatePayload(t).containsKey('is_active'), isFalse);
    });

    test('проверка перед сохранением', () {
      TemplateDraft t({String name = 'А', String time = '10:00', List<EditorBlock>? blocks}) => TemplateDraft(id: 0, name: name, description: '', startTime: time, active: true, rule: const {}, blocks: blocks ?? [block(-1, 2)]);
      expect(validateTemplate(t()), isNull);
      expect(validateTemplate(t(name: '  ')), 'Укажите название шаблона');
      expect(validateTemplate(t(blocks: [])), 'Добавьте хотя бы один блок');
      expect(validateTemplate(t(time: '9:00')), 'Укажите время начала');
    });

    test('шаблон из программы переносит блоки и ответственных', () {
      final p = plan(blocks: [block(2, 1, order: 1, assigned: 12), block(1, 2, order: 0)]);
      final t = templateFromPlan(p, 'Мой шаблон');
      expect(t.isNew, isTrue);
      expect([for (final b in t.blocks) b.id], [1, 2]);
      expect(t.startTime, '10:00');
      expect(t.description, contains('22.11.2026'));
      expect(templatePayload(t)['blocks'][1]['default_content_json']['default_assigned_member_id'], 12);
    });

    test('разбор шаблона с сервера: ответственный и песня по умолчанию', () {
      final t = TemplateDraft.fromJson({
        'id': 3, 'name': 'Т', 'default_start_time': '10:00:00', 'is_active': true, 'recurrence_rule': {'frequency': 'weekly', 'byWeekday': 0},
        'blocks': [
          {'id': 9, 'block_type_id': 1, 'title': 'Песня', 'order_index': 1, 'duration_minutes': 5, 'default_song_id': 5, 'default_content_json': {'default_assigned_member_id': 12}},
          {'id': 8, 'block_type_id': 2, 'title': 'Молитва', 'order_index': 0, 'duration_minutes': 3, 'default_song_id': null, 'default_content_json': {}},
        ],
      })!;
      expect(t.startTime, '10:00');
      expect([for (final b in t.blocks) b.id], [8, 9], reason: 'отсортированы по порядку');
      expect(t.blocks[1].assignedId, 12);
      expect(t.blocks[1].songId, 5);
      expect(PlanTemplate.fromJson({'id': 4, 'name': 'Выкл', 'is_active': false}), isNull);
      expect(PlanTemplate.fromJson({'id': 4, 'name': 'Выкл', 'is_active': false}, onlyActive: false)!.active, isFalse);
    });
  });

  group('редактор шаблона', () {
    test('новый шаблон: заготовка с одним блоком и повтором по воскресеньям', () async {
      final (c, _) = await _open();
      expect(c.isNew, isTrue);
      expect(c.draft!.name, 'Новый шаблон');
      expect(c.draft!.blocks.length, 1);
      expect(ruleWeekday(c.draft!.rule), 0);
      expect(c.dirty, isFalse);
    });

    test('правки помечают шаблон изменённым; блоки добавляются, удаляются и возвращаются', () async {
      final (c, _) = await _open();
      c.update(name: 'Вечернее служение');
      expect(c.dirty, isTrue);
      final id = c.addBlock()!;
      expect(id, lessThan(0));
      expect(c.draft!.blocks.last.title, 'Новый блок 2');
      final sep = c.addSeparator()!;
      expect(c.draft!.blocks.last.isSeparator, isTrue);
      final removed = c.delete(sep)!;
      expect(c.draft!.blocks.length, 2);
      c.restore(removed);
      expect(c.draft!.blocks.last.id, sep);
      c.reorder(0, 3);
      expect(c.draft!.blocks.first.id, id);
      expect([for (final b in c.draft!.blocks) b.order], [0, 1, 2]);
    });

    test('сохранение нового шаблона: создаётся, флаг изменений сбрасывается', () async {
      final (c, f) = await _open();
      c.update(name: 'Праздничное');
      expect(await c.save(), 50);
      expect(f.log, contains('createTemplate'));
      expect(f.templateWrites.single['name'], 'Праздничное');
      expect(f.templateWrites.single.containsKey('is_active'), isFalse);
      expect(c.dirty, isFalse);
    });

    test('сохранение существующего: PATCH с is_active', () async {
      final (c, f) = await _open(id: 1);
      expect(c.draft!.name, 'Воскресное служение');
      c.update(active: false);
      expect(await c.save(), 1);
      expect(f.log, contains('patchTemplate 1'));
      expect(f.templateWrites.single['is_active'], false);
      expect(f.templateWrites.single['blocks'][1]['default_content_json']['default_assigned_member_id'], 12);
    });

    test('пустое название или нет блоков — не сохраняется, причина понятна', () async {
      final (c, f) = await _open();
      c.update(name: ' ');
      expect(await c.save(), isNull);
      expect(c.saveError, 'Укажите название шаблона');
      c.update(name: 'А');
      c.delete(c.draft!.blocks.first.id);
      expect(await c.save(), isNull);
      expect(c.saveError, 'Добавьте хотя бы один блок');
      expect(f.log.where((l) => l.contains('Template')), isEmpty);
    });

    test('сбой сервера: текст ошибки, правки остаются', () async {
      final (c, f) = await _open();
      f.failTemplateSave = StateError('Нет прав');
      expect(await c.save(), isNull);
      expect(c.saveError, 'Нет прав');
      expect(c.dirty, isFalse, reason: 'до первой правки dirty=false, данные не потеряны');
      expect(c.draft!.blocks, isNotEmpty);
      expect(c.saving, isFalse);
    });

    test('«подтянуть из другого шаблона»: у нового — копия с новыми id, у существующего своё имя', () async {
      final (c, _) = await _open();
      expect(await c.importFrom(1), isTrue);
      expect(c.draft!.name, 'Воскресное служение (копия)');
      expect(c.draft!.blocks.length, 2);
      expect(c.draft!.blocks.every((b) => b.id < 0), isTrue);
      expect(c.draft!.blocks[1].assignedId, 12);
      final (e, _) = await _open(id: 2);
      expect(await e.importFrom(1), isTrue);
      expect(e.draft!.name, 'Молодёжная встреча');
      expect(e.draft!.startTime, '10:00');
    });

    test('удаление шаблона', () async {
      final (c, f) = await _open(id: 2);
      expect(await c.remove(), isTrue);
      expect(f.log, contains('deleteTemplate 2'));
      final (n, _) = await _open();
      expect(await n.remove(), isFalse, reason: 'новый шаблон удалять нечего');
    });
  });
}
