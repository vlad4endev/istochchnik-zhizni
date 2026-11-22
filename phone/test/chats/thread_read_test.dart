import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/thread_controller.dart';

import 'fake_chat.dart';

FakeChat _chat({String type = 'group'}) => FakeChat()
  ..metaNow = ChatMeta(type: type, title: 'Чат')
  ..all = [
    msg('1', sender: 2, text: 'привет'),
    msg('2', sender: 9, name: 'Мария Лис', text: 'мой ответ'),
    msg('3', sender: 2, text: 'ещё'),
  ];

ThreadController _make(FakeChat s, {int? peer, void Function()? onRead}) => ThreadController(s, conversationId: 'c1', meId: 9, knownPeerId: peer, onRead: onRead);

void main() {
  group('«прочитано»', () {
    test('после загрузки чат отмечается прочитанным до последнего сообщения', () async {
      final s = _chat();
      var badge = 0;
      final c = _make(s, onRead: () => badge++);
      await c.load();
      await pumpEventQueue();
      expect(s.readMarks, ['3']);
      expect(badge, 1, reason: 'значок непрочитанных обновляется');
    });

    test('повторная загрузка без новых сообщений запрос не шлёт', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      await c.refresh();
      await pumpEventQueue();
      expect(s.readMarks, ['3']);
    });

    test('пришло новое сообщение — отмечается до него', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      s.all = [...s.all, msg('7', sender: 2, text: 'новое')];
      await c.refresh();
      await pumpEventQueue();
      expect(s.readMarks, ['3', '7']);
    });

    test('сбой сети: повторим при следующем обновлении, ничего не ломается', () async {
      final s = _chat()..failRead = true;
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(s.readMarks, isEmpty);
      expect(c.error, isNull);
      s.failRead = false;
      await c.refresh();
      await pumpEventQueue();
      expect(s.readMarks, ['3']);
    });

    test('свернутое приложение сообщения не читает, по возвращении — читает', () async {
      final s = _chat();
      final c = _make(s)..active = false;
      await c.load();
      await pumpEventQueue();
      expect(s.readMarks, isEmpty);
      c.active = true;
      await c.markRead();
      expect(s.readMarks, ['3']);
    });

    test('неотправленные свои сообщения в счёт не идут', () async {
      final s = FakeChat()..all = [msg('5', sender: 2)];
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(s.readMarks, ['5']);
      c.messages = [...c.messages, msg('99999', sender: 9, pending: true)];
      await c.markRead();
      expect(s.readMarks, ['5']);
    });
  });

  group('собеседник личного чата', () {
    test('известный при открытии — запрос профиля не нужен', () async {
      final s = _chat(type: 'private');
      final c = _make(s, peer: 2);
      await c.load();
      await pumpEventQueue();
      expect(c.peerId, 2);
      expect(s.calls.where((x) => x.startsWith('profile')), isEmpty);
    });

    test('чат открыт из пуша (собеседник неизвестен) — узнаём с сервера', () async {
      final s = _chat(type: 'private');
      final c = _make(s);
      expect(c.peerId, isNull);
      await c.load();
      await pumpEventQueue();
      expect(c.peerId, 2, reason: 'из профиля: id собеседника');
    });

    test('в группе собеседника не ищем', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(c.peerId, isNull);
    });

    test('сбой профиля — можно повторить', () async {
      final s = _chat(type: 'private')..failProfile = true;
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(c.peerId, isNull);
      s.failProfile = false;
      await c.ensurePeer();
      expect(c.peerId, 2);
    });
  });
}
