import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/data/lost_attachments.dart';
import 'package:molitva/features/chats/logic/attachment_logic.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Source implements LostPickSource {
  _Source(this.files);
  final List<PickedAttachment> files;
  int calls = 0;
  @override
  Future<List<PickedAttachment>> recover() async {
    calls++;
    return files;
  }
}

class _Delayed implements LostPickSource {
  _Delayed(this.future);
  final Future<List<PickedAttachment>> future;
  @override
  Future<List<PickedAttachment>> recover() => future;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('нет записи — ничего не открываем и потерянный выбор не ищем', () async {
    final source = _Source(const []);
    var opened = false;
    final result = await reopenAfterPickerKill(source: source, open: (_, _) async => opened = true);
    expect(result, isFalse);
    expect(opened, isFalse);
    expect(source.calls, 0);
  });

  test('приложение выгрузили при выборе: чат открывается, файлы передаются, запись стирается', () async {
    await AttachRecovery.mark('42', 'Наталья');
    PendingAttach? chat;
    List<PickedAttachment>? files;
    final result = await reopenAfterPickerKill(
      source: _Source([const PickedAttachment(path: '/tmp/a.jpg', name: 'a.jpg')]),
      open: (c, f) async {
        chat = c;
        files = await f;
      },
    );
    expect(result, isTrue);
    expect(chat!.conversationId, '42');
    expect(chat!.title, 'Наталья');
    expect(files!.single.name, 'a.jpg');
    expect(await AttachRecovery.read(), isNull, reason: 'второй запуск не должен снова открывать чат');
  });

  test('окно закрыли без выбора, но приложение перезапустилось: чат всё равно открывается, файлов нет', () async {
    await AttachRecovery.mark('7', '');
    List<PickedAttachment>? files;
    expect(await reopenAfterPickerKill(source: _Source(const []), open: (_, f) async => files = await f), isTrue);
    expect(files, isEmpty);
  });

  test('чат открывается сразу, не дожидаясь файлов; сбой плагина не роняет запуск', () async {
    await AttachRecovery.mark('42', 'Наталья');
    final slow = Completer<List<PickedAttachment>>();
    var opened = false;
    late Future<List<PickedAttachment>> pendingFiles;
    final done = reopenAfterPickerKill(
      source: _Delayed(slow.future),
      open: (_, f) async {
        opened = true;
        pendingFiles = f;
      },
    );
    await done;
    expect(opened, isTrue, reason: 'чат открыт, хотя файл ещё не готов');
    slow.completeError(StateError('плагин упал'));
    expect(await pendingFiles, isEmpty);
  });

  test('после нормального возврата запись стирается — при следующем запуске чат не открывается', () async {
    await AttachRecovery.mark('42', 'Наталья');
    await AttachRecovery.clear();
    expect(await reopenAfterPickerKill(source: _Source(const []), open: (_, _) async {}), isFalse);
  });

  test('запись старше 15 минут забыта', () async {
    await AttachRecovery.mark('42', 'Наталья');
    final later = DateTime.now().add(const Duration(minutes: 16));
    expect(await AttachRecovery.read(now: later), isNull);
    expect(await AttachRecovery.read(now: DateTime.now().add(const Duration(minutes: 5))), isNotNull);
  });

  test('повреждённая запись не роняет запуск', () async {
    SharedPreferences.setMockInitialValues({debugPendingKey(): 'не json'});
    expect(await AttachRecovery.read(), isNull);
  });
}
