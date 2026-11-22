import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/calls/logic/call_access.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  test('статусы системы → понятные состояния', () {
    expect(accessOf(PermissionStatus.granted), Access.granted);
    expect(accessOf(PermissionStatus.limited), Access.granted);
    expect(accessOf(PermissionStatus.denied), Access.denied);
    expect(accessOf(PermissionStatus.permanentlyDenied), Access.blocked);
    expect(accessOf(PermissionStatus.restricted), Access.blocked);
  });

  test('всё разрешено: входим, камера как просили', () {
    final d = decideCallAccess(mic: Access.granted, cam: Access.granted, wantCamera: true);
    expect(d.canJoin, isTrue);
    expect(d.useCamera, isTrue);
    expect(d.error, isNull);
    expect(d.notice, isNull);
  });

  test('аудиозвонок: камера не нужна и не спрашивается', () {
    final d = decideCallAccess(mic: Access.granted, cam: Access.denied, wantCamera: false);
    expect(d.canJoin, isTrue);
    expect(d.useCamera, isFalse);
    expect(d.notice, isNull);
  });

  test('микрофон отклонён: не входим, можно повторить', () {
    final d = decideCallAccess(mic: Access.denied, cam: Access.granted, wantCamera: true);
    expect(d.canJoin, isFalse);
    expect(d.offerSettings, isFalse);
    expect(d.error, contains('Повторить'));
  });

  test('микрофон запрещён навсегда: предлагаем настройки телефона', () {
    final d = decideCallAccess(mic: Access.blocked, cam: Access.granted, wantCamera: false);
    expect(d.canJoin, isFalse);
    expect(d.offerSettings, isTrue);
    expect(d.error, contains('настройках'));
  });

  test('камера отклонена: входим без видео и говорим об этом', () {
    final d = decideCallAccess(mic: Access.granted, cam: Access.denied, wantCamera: true);
    expect(d.canJoin, isTrue);
    expect(d.useCamera, isFalse);
    expect(d.notice, 'Нет доступа к камере — вы без видео.');
    final blocked = decideCallAccess(mic: Access.granted, cam: Access.blocked, wantCamera: true);
    expect(blocked.notice, contains('настройках'));
  });
}
