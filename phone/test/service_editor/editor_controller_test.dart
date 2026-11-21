import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/service/editor/plan_editor_controller.dart';

import 'fake_editor.dart';

Future<(PlanEditorController, FakeEditor)> _open({bool manage = true, FakeEditor? fake}) async {
  final f = fake ?? FakeEditor(plan(preacher: 11, music: 12));
  final c = PlanEditorController(f, 7, canManage: manage, debounce: const Duration(milliseconds: 10));
  addTearDown(c.dispose);
  await c.load();
  return (c, f);
}

void main() {
  test('загрузка применяет проповедника и музыканта к блокам', () async {
    final (c, _) = await _open();
    expect(c.loading, isFalse);
    expect(c.draft!.blocks[2].title, 'Пётр Сидоров - Вера');
    expect(c.draft!.blocks[2].assignedId, 11);
    expect(c.draft!.blocks[1].assignedId, 12);
  });

  test('сбой загрузки: понятная ошибка, повторная загрузка работает', () async {
    final f = FakeEditor(plan());
    final c = PlanEditorController(f, 7);
    addTearDown(c.dispose);
    await c.load();
    expect(c.error, isNull);
    expect(c.draft, isNotNull);
  });

  test('правка блока: автосохранение шлёт только изменённый блок', () async {
    final (c, f) = await _open();
    c.updateBlock(1, (b) => b.copyWith(title: 'Общая молитва', minutes: 7));
    expect(c.saveStatus, SaveStatus.saving);
    await Future<void>.delayed(const Duration(milliseconds: 60));
    expect(f.log.where((l) => l.startsWith('patchBlock')).toList(), ['patchBlock 1']);
    expect(f.patched[1]!['title'], 'Общая молитва');
    expect(f.patched[1]!['duration_minutes'], 7);
    expect(c.saveStatus, SaveStatus.saved);
    expect(c.hasUnsaved, isFalse);
  });

  test('быстрые правки подряд склеиваются в одно сохранение', () async {
    final (c, f) = await _open();
    for (var i = 0; i < 5; i++) {
      c.updateBlock(1, (b) => b.copyWith(title: 'v$i'));
    }
    await Future<void>.delayed(const Duration(milliseconds: 60));
    expect(f.log.where((l) => l == 'patchBlock 1').length, 1);
    expect(f.patched[1]!['title'], 'v4');
  });

  test('смена проповедника меняет заголовок и ответственного блока проповеди и сохраняет план', () async {
    final (c, f) = await _open();
    c.updateSettings(preacherId: 10);
    expect(c.draft!.blocks[2].title, 'Анна Орлова - Вера');
    expect(c.draft!.blocks[2].assignedId, 10);
    await c.flush();
    expect(f.patched[3]!['assigned_member_id'], 10);
    expect(f.planPatches.single['preacher_member_id'], 10);
    expect(f.planPatches.single['service_date'], '2026-11-22');
  });

  test('без прав на настройки: изменения плана игнорируются', () async {
    final (c, f) = await _open(manage: false);
    c.updateSettings(startTime: '11:00');
    expect(c.draft!.startTime, '10:00');
    await c.flush();
    expect(f.planPatches, isEmpty);
  });

  test('сбой сохранения: статус «ошибка», правка не теряется, «повторить» её отправляет', () async {
    final (c, f) = await _open();
    f.failPatchBlock = StateError('Нет связи');
    c.updateBlock(1, (b) => b.copyWith(title: 'X'));
    expect(await c.flush(), isFalse);
    expect(c.saveStatus, SaveStatus.error);
    expect(c.saveError, 'Нет связи');
    expect(c.hasUnsaved, isTrue);
    f.failPatchBlock = null;
    expect(await c.flush(), isTrue);
    expect(f.patched[1]!['title'], 'X');
    expect(c.saveStatus, SaveStatus.saved);
  });

  test('добавить блок и разделитель', () async {
    final (c, f) = await _open();
    final id = await c.addBlock();
    expect(id, 100);
    expect(c.draft!.blocks.last.title, 'Новый блок');
    expect(c.draft!.blocks.last.order, 3);
    final sep = await c.addSeparator();
    expect(sep, 101);
    expect(c.draft!.blocks.last.isSeparator, isTrue);
    expect(c.draft!.blocks.last.typeId, custom.id);
    expect(f.log.where((l) => l.startsWith('createBlock')).length, 2);
  });

  test('удаление: блок исчезает сразу, порядок перенумеруется', () async {
    final (c, f) = await _open();
    final snap = await c.deleteBlock(2);
    expect(snap!.id, 2);
    expect([for (final b in c.draft!.blocks) b.order], [0, 1]);
    expect(f.log, contains('deleteBlock 2'));
  });

  test('сервер не удалил — блок возвращается на место, показывается ошибка', () async {
    final (c, f) = await _open();
    f.failDelete = StateError('Нельзя удалить');
    expect(await c.deleteBlock(2), isNull);
    expect(c.draft!.blocks.length, 3);
    expect(c.saveError, 'Нельзя удалить');
  });

  test('«Отменить» удаление создаёт блок заново на прежнем месте', () async {
    final (c, f) = await _open();
    final snap = (await c.deleteBlock(2))!;
    await c.restoreBlock(snap);
    expect(c.draft!.blocks.length, 3);
    expect(c.draft!.blocks[1].id, 100);
    expect(c.draft!.blocks[1].title, snap.title);
    await c.flush();
    expect(f.patched[100]!['assigned_member_id'], 12, reason: 'ответственный за песню восстановлен');
    expect(f.log.last, startsWith('patchBlock'));
  });

  test('перетаскивание: оптимистично и с запросом порядка', () async {
    final (c, f) = await _open();
    await c.reorder(0, 3);
    expect([for (final b in c.draft!.blocks) b.id], [2, 3, 1]);
    expect(f.log.last, 'reorder 2,3,1');
  });

  test('перетаскивание не удалось — порядок перечитывается с сервера', () async {
    final (c, f) = await _open();
    f.failReorder = StateError('Сбой');
    await c.reorder(0, 3);
    expect([for (final b in c.draft!.blocks) b.id], [1, 2, 3]);
    expect(c.saveError, 'Сбой');
  });

  test('публикация: сначала блоки, потом статус; повторная рассылка по выбору', () async {
    final (c, f) = await _open();
    c.updateBlock(1, (b) => b.copyWith(title: 'Молитва!'));
    final result = await c.togglePublish(sendNotify: false);
    expect(result!.notify, 'sent');
    final firstPatchBlock = f.log.indexWhere((l) => l.startsWith('patchBlock'));
    final planPatch = f.log.lastIndexOf('patchPlan');
    expect(firstPatchBlock, lessThan(planPatch));
    expect(f.planPatches.last['status'], 'published');
    expect(f.planPatches.last['send_published_notify'], false);
    expect(c.draft!.published, isTrue);
    expect(c.draft!.notifySentAt, isNotNull);
  });

  test('возврат в черновик не шлёт флаг рассылки', () async {
    final f = FakeEditor(plan(published: true, preacher: 11, music: 12));
    final (c, _) = await _open(fake: f);
    await c.togglePublish(sendNotify: true);
    expect(f.planPatches.last['status'], 'draft');
    expect(f.planPatches.last.containsKey('send_published_notify'), isFalse);
    expect(c.draft!.published, isFalse);
  });

  test('сбой публикации: статус не меняется', () async {
    final (c, f) = await _open();
    f.failPlanPatch = StateError('Нет прав');
    expect(await c.togglePublish(), isNull);
    expect(c.draft!.published, isFalse);
    expect(c.saveError, 'Нет прав');
    expect(c.busy, isFalse);
  });

  test('архив и удаление программы', () async {
    final (c, f) = await _open();
    expect(await c.setArchived(true), isTrue);
    expect(c.draft!.archived, isTrue);
    expect(f.planPatches.last, {'is_archived': true});
    expect(await c.deletePlan(), isTrue);
    expect(f.log.last, 'deletePlan');
  });

  test('песни загружаются один раз', () async {
    final (c, _) = await _open();
    await c.loadSongs();
    expect(c.songs!.single.title, 'Великий Бог');
  });
}
