import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/features/service/editor/logic/editor_logic.dart';

import 'fake_editor.dart';

AppUser _user({String role = 'member', List<String> roles = const ['member'], String ministryRole = ''}) =>
    AppUser(id: 1, name: 'Я', firstName: 'Я', lastName: 'Я', role: role, roles: roles, registrationStatus: 'active', ministryRole: ministryRole);

void main() {
  test('время блоков: старт, разделитель без длительности, конец служения', () {
    final p = plan(blocks: [
      block(1, 2, order: 0, minutes: 5),
      block(2, 4, order: 1, minutes: 30, content: {'is_separator': true}),
      block(3, 1, order: 2, minutes: 10),
    ]);
    final t = timedBlocks(p);
    expect([for (final s in t) s.startsAt], ['10:00', '10:05', '10:05']);
    expect(totalMinutes(p.blocks), 15);
    expect(endTime(p), '10:15');
  });

  test('конец служения переходит через полночь без отрицательных значений', () {
    final p = plan(blocks: [block(1, 2, minutes: 600)]);
    expect(endTime(p.copyWith(startTime: '20:00')), '06:00');
  });

  test('перетаскивание: индексы как у ReorderableListView, порядок перенумеруется', () {
    final list = [for (var i = 0; i < 4; i++) block(i + 1, 2, order: i)];
    expect([for (final b in reorderBlocks(list, 0, 3)) b.id], [2, 3, 1, 4]);
    expect([for (final b in reorderBlocks(list, 3, 0)) b.id], [4, 1, 2, 3]);
    expect([for (final b in reorderBlocks(list, 1, 4)) b.id], [1, 3, 4, 2]);
    expect([for (final b in reorderBlocks(list, 2, 2)) b.order], [0, 1, 2, 3]);
    expect(reorderBlocks(list, 9, 0).length, 4);
  });

  test('проповедь — за проповедником с темой, песни — за ответственным за музыку', () {
    final p = plan(preacher: 11, music: 12);
    final res = applyResponsibles(p, {for (final t in [song, prayer, sermon]) t.id: t}, {for (final m in [anna, petr, lena]) m.id: m});
    expect(res[2].assignedId, 11);
    expect(res[2].title, 'Пётр Сидоров - Вера');
    expect(res[1].assignedId, 12);
    expect(res[0].assignedId, isNull);
  });

  test('без проповедника заголовок «Проповедник», без темы — только имя', () {
    final p = plan(blocks: [block(3, 3, title: 'x', order: 0)]);
    final res = applyResponsibles(p, {3: sermon}, {});
    expect(res.single.title, 'Проповедник');
  });

  test('кандидаты: ведущий, проповедник, музыкант по роли и направлению', () {
    expect(isLeaderCandidate(anna), isTrue);
    expect(isLeaderCandidate(petr), isFalse);
    expect(isPreacherCandidate(petr), isTrue);
    expect(isMusicCandidate(lena), isTrue);
    expect(isMusicCandidate(anna), isFalse);
  });

  test('права: админ и служитель правят план; шаблоны — ещё и ведущий', () {
    expect(canManagePlan(_user(role: 'admin', roles: const ['admin'])), isTrue);
    expect(canManagePlan(_user(roles: const ['member', 'minister'])), isTrue);
    expect(canManagePlan(_user()), isFalse);
    expect(canManagePlan(null), isFalse);
    expect(canManageTemplates(_user(ministryRole: 'Ведущий, Музыкант')), isTrue);
    expect(canManageTemplates(_user()), isFalse);
    expect(canSaveAsTemplate(_user(role: 'admin')), isTrue);
    expect(canSaveAsTemplate(_user(roles: const ['minister'])), isFalse);
  });

  test('«сцена перед блоком»: варианты исключают друг друга', () {
    var c = <String, dynamic>{'x': 1};
    c = setStageRemove(c, true);
    expect(stageRemoveOn(c), isTrue);
    c = setStagePlace(c, true);
    expect(stagePlaceOn(c), isTrue);
    expect(stageRemoveOn(c), isFalse);
    expect(c['x'], 1);
    c = setStagePlace(c, false);
    expect(stagePlaceOn(c), isFalse);
  });

  test('название песни с тональностью и обратно', () {
    expect(songBlockTitle('Великий Бог', 'G'), 'Великий Бог [G]');
    expect(songBlockTitle('Великий Бог', ' '), 'Великий Бог');
    expect(splitTitleAndKey('Великий Бог [G]'), (title: 'Великий Бог', key: 'G'));
    expect(splitTitleAndKey('Без тона'), (title: 'Без тона', key: null));
  });

  test('длительность из поля: мусор, минус, больше десяти часов', () {
    expect(parseMinutes('15'), 15);
    expect(parseMinutes(''), 0);
    expect(parseMinutes('abc', fallback: 5), 5);
    expect(parseMinutes('-4'), 0);
    expect(parseMinutes('9999'), maxBlockMinutes);
  });
}
