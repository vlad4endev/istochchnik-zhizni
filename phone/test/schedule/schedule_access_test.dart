import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';

void main() {
  test('рядовой участник не видит расписаний', () {
    const a = MinistryAccess(roles: ['member']);
    expect(a.viewable, isEmpty);
    for (final m in Ministry.values) {
      expect(a.canManage(m), isFalse);
    }
  });

  test('направление «Медиа служение» открывает только медиа, без управления', () {
    const a = MinistryAccess(roles: ['member'], ministryDirection: 'Медиа служение');
    expect(a.viewable, [Ministry.media]);
    expect(a.canManage(Ministry.media), isFalse);
  });

  test('несколько направлений через запятую и «ё»', () {
    const a = MinistryAccess(roles: ['member'], ministryDirection: 'Музыкальное служение; Медиа служение');
    expect(a.viewable, [Ministry.media, Ministry.music]);
  });

  test('роль «Медиа менеджер» видит и управляет медиа', () {
    const a = MinistryAccess(roles: ['member'], ministryRole: 'Медиа менеджер');
    expect(a.canView(Ministry.media), isTrue);
    expect(a.canManage(Ministry.media), isTrue);
    expect(a.canManage(Ministry.music), isFalse);
  });

  test('ведущий и проповедник видят воскресное служение', () {
    expect(const MinistryAccess(roles: ['member'], ministryRole: 'Ведущий').canView(Ministry.sunday), isTrue);
    expect(const MinistryAccess(roles: ['member'], ministryRole: 'Проповедник').canView(Ministry.sunday), isTrue);
    expect(const MinistryAccess(roles: ['member'], ministryDirection: 'Воскресное служение').canView(Ministry.sunday), isTrue);
  });

  test('музыкальный лидер управляет музыкой', () {
    for (final r in ['Музыкальный лидер', 'лидер прославления', 'Лидер поклонения']) {
      expect(MinistryAccess(roles: const ['member'], ministryRole: r).canManage(Ministry.music), isTrue, reason: r);
    }
  });

  test('администратор — всё, пастор — воскресное, музыкант — музыка и просмотр медиа', () {
    const admin = MinistryAccess(roles: ['admin']);
    expect(admin.viewable, Ministry.values);
    expect([for (final m in Ministry.values) admin.canManage(m)], [true, true, true]);

    const pastor = MinistryAccess(roles: ['pastor']);
    expect(pastor.viewable, [Ministry.sunday]);
    expect(pastor.canManage(Ministry.sunday), isTrue);

    const musician = MinistryAccess(roles: ['musician']);
    expect(musician.viewable, Ministry.values);
    expect(musician.canManage(Ministry.music), isTrue);
    expect(musician.canManage(Ministry.media), isFalse);
    expect(musician.canManage(Ministry.sunday), isFalse);
  });
}
