import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/thread_controller.dart';

import 'fake_chat.dart';

ThreadController _make(FakeChat s, {int pageSize = 50}) => ThreadController(s, conversationId: 'c1', meId: 9, pageSize: pageSize);

FakeChat _chat([int count = 3]) => FakeChat()..all = [for (var i = 1; i <= count; i++) msg('$i', text: 'm$i')];

void main() {
  group('загрузка', () {
    test('сообщения, права и участники группы', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(c.messages.map((m) => m.id), ['1', '2', '3']);
      expect(c.meta!.type, 'group');
      expect(c.isGroupLike, isTrue);
      expect(c.members[2]!.avatarUrl, 'https://x/a.jpg');
      expect(c.memberOf(9)!.role, 'owner');
      expect(c.memberOf(null), isNull);
      expect(c.loading, isFalse);
    });

    test('личный чат: участников не запрашиваем', () async {
      final s = _chat()..metaNow = const ChatMeta(type: 'private');
      final c = _make(s);
      await c.load();
      await pumpEventQueue();
      expect(s.calls, isNot(contains('members')));
    });

    test('сбой сообщений в первый раз — ошибка; обновление после сбоя прежнее не стирает', () async {
      final s = _chat()..failMessages = true;
      final c = _make(s);
      await c.load();
      expect(c.error, contains('Не удалось загрузить сообщения'));
      s.failMessages = false;
      await c.load();
      expect(c.error, isNull);
      expect(c.messages, hasLength(3));
      s.failMessages = true;
      await c.load();
      expect(c.error, isNull);
      expect(c.messages, hasLength(3), reason: 'без сети остаётся прежнее');
    });

    test('нет прав с сервера — писать можно; запрет — нельзя', () async {
      final s = _chat()..failMeta = true;
      final c = _make(s);
      await c.load();
      expect(c.canSend, isTrue);
      final ro = _make(_chat()..metaNow = ChatMeta.fromJson({'type': 'channel', 'my_effective_permissions': {'can_send_messages': false}}));
      await ro.load();
      expect(ro.canSend, isFalse);
      expect(ro.canSendMedia, isFalse);
    });

    test('история подгружается страницами и не дублирует', () async {
      final s = _chat(7);
      final c = _make(s, pageSize: 3);
      await c.load();
      expect(c.messages.map((m) => m.id), ['5', '6', '7']);
      expect(c.hasMore, isTrue);
      await c.loadOlder();
      expect(c.messages.map((m) => m.id), ['2', '3', '4', '5', '6', '7']);
      await c.loadOlder();
      expect(c.messages.map((m) => m.id), ['1', '2', '3', '4', '5', '6', '7']);
      expect(c.hasMore, isFalse);
      s.calls.clear();
      await c.loadOlder();
      expect(s.calls, isEmpty, reason: 'больше нечего грузить');
    });

    test('тихое обновление сохраняет подгруженную историю и подтягивает новые', () async {
      final s = _chat(7);
      final c = _make(s, pageSize: 3);
      await c.load();
      await c.loadOlder();
      s.all.add(msg('8', text: 'новое'));
      await c.refresh();
      expect(c.messages.map((m) => m.id), ['2', '3', '4', '5', '6', '7', '8'], reason: 'подгруженная история + свежая часть');
    });
  });

  group('отправка, ответ, правка', () {
    test('текст уходит и сразу виден; пустой не отправляется', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await c.submit('   ');
      expect(s.calls.where((x) => x.startsWith('send')), isEmpty);
      await c.submit(' Привет всем ');
      expect(s.calls, contains('send:Привет всем::text'));
      expect(c.messages.last.content, 'Привет всем');
      expect(c.sending, isFalse);
    });

    test('ответ: цитата уходит с сообщением и сбрасывается', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      c.startReply(c.messages[1]);
      expect(c.replyTo!.id, '2');
      await c.submit('Согласен');
      expect(s.calls, contains('send:Согласен:2:text'));
      expect(c.replyTo, isNull);
    });

    test('правка: меняет текст на месте, не создаёт новое сообщение', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      c.startEdit(c.messages[2]);
      expect(c.replyTo, isNull);
      await c.submit('исправлено');
      expect(s.calls, contains('edit:3:исправлено'));
      expect(s.calls.where((x) => x.startsWith('send')), isEmpty);
      expect(c.messages[2].content, 'исправлено');
      expect(c.messages[2].isEdited, isTrue);
      expect(c.editing, isNull);
    });

    test('режимы ответа и правки взаимоисключающие; отмена очищает', () async {
      final c = _make(_chat());
      await c.load();
      c.startReply(c.messages.first);
      c.startEdit(c.messages.last);
      expect((c.replyTo, c.editing?.id), (null, '3'));
      c.cancelComposerMode();
      expect((c.replyTo, c.editing), (null, null));
    });

    test('сбой отправки: исключение вызывающему, текст не пропал (ответ остался)', () async {
      final s = _chat()..failSend = true;
      final c = _make(s);
      await c.load();
      c.startReply(c.messages.first);
      await expectLater(c.submit('x'), throwsStateError);
      expect(c.replyTo, isNotNull);
      expect(c.sending, isFalse);
      expect(c.messages, hasLength(3));
    });

    test('вложение: уходит как отдельное сообщение', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await c.sendPayload(payloadType: 'image', payload: {'url': '/u/1'});
      expect(s.calls, contains('send:::image'));
    });
  });

  group('реакции, удаление', () {
    test('реакция видна сразу; повторное нажатие снимает', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      final f = c.react(c.messages[0], '👍');
      expect(c.messages[0].reactions.single.byMe, isTrue);
      await f;
      expect(s.calls, contains('react:1:👍:add'));
      await c.react(c.messages[0], '👍');
      expect(c.messages[0].reactions, isEmpty);
      expect(s.calls, contains('react:1:👍:remove'));
    });

    test('сбой реакции откатывает', () async {
      final s = _chat()..failReact = true;
      final c = _make(s);
      await c.load();
      await expectLater(c.react(c.messages[0], '🔥'), throwsStateError);
      expect(c.messages[0].reactions, isEmpty);
    });

    test('удаление и откат при сбое', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await c.remove(c.messages[1]);
      expect(c.messages[1].isDeleted, isTrue);
      s.failDelete = true;
      await expectLater(c.remove(c.messages[2]), throwsStateError);
      expect(c.messages[2].isDeleted, isFalse);
    });

    test('закрепление', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await c.pin(c.messages[0], true);
      expect(c.messages[0].isPinned, isTrue);
      expect(s.calls, contains('pin:1:true'));
    });

    test('голосование обновляет опрос', () async {
      final s = _chat();
      final c = _make(s);
      await c.load();
      await c.vote(c.messages[0], 1);
      expect(s.calls, contains('vote:1:1'));
    });
  });

  group('карточки ссылок', () {
    test('один адрес запрашивается один раз', () async {
      final s = _chat();
      s.previews['https://a.ru'] = const LinkPreview(url: 'https://a.ru', host: 'a.ru', title: 'Т');
      final c = _make(s);
      final a = await c.previewOf('https://a.ru');
      final b = await c.previewOf('https://a.ru');
      expect(a!.title, 'Т');
      expect(identical(a, b), isTrue);
      expect(s.calls.where((x) => x.startsWith('preview')), hasLength(1));
      expect(await c.previewOf('https://none.ru'), isNull);
    });
  });

  group('сокет', () {
    test('событие этого чата → тихое обновление с задержкой; чужой чат игнорируется', () {
      fakeAsync((async) {
        final s = _chat();
        final c = _make(s);
        final events = StreamController<Map<String, dynamic>>.broadcast();
        c.listen(events.stream);
        c.load();
        async.flushMicrotasks();
        s.calls.clear();
        events.add({'type': 'msg:new', 'conversationId': 'other'});
        async.elapse(const Duration(seconds: 1));
        expect(s.calls, isEmpty);
        s.all.add(msg('4', text: 'новое'));
        events.add({'type': 'msg:new', 'conversationId': 'c1'});
        events.add({'type': 'msg:reaction', 'conversationId': 'c1'});
        async.elapse(const Duration(milliseconds: 200));
        expect(s.calls.where((x) => x.startsWith('messages')), isEmpty, reason: 'ещё не прошла задержка');
        async.elapse(const Duration(milliseconds: 300));
        async.flushMicrotasks();
        expect(s.calls.where((x) => x.startsWith('messages')), hasLength(1), reason: 'два события — одно обновление');
        expect(c.messages.map((m) => m.id), ['1', '2', '3', '4']);
        c.dispose();
        events.close();
      });
    });
  });
}
