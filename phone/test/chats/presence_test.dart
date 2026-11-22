import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/presence.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:molitva/features/chats/data/chat_list_actions.dart';
import 'package:provider/provider.dart';

class _Noop implements ChatListActions {
  @override
  Future<void> clearHistory(String id) async {}
  @override
  Future<void> leave(String id) async {}
  @override
  Future<void> setMuted(String id, bool muted) async {}
  @override
  Future<void> setPinned(String id, bool pinned) async {}
}

Map<String, dynamic> _chat(String id, String type, int peer, String name) => {
      'id': id,
      'type': type,
      'title': type == 'private' ? '' : name,
      'other_member': type == 'private' ? {'id': peer, 'name': name} : null,
      'unread_count': 0,
      'last_message': {'content': 'Привет', 'created_at': '2026-11-22T10:00:00Z'},
    };

void main() {
  group('хранилище присутствия', () {
    test('список при подключении, затем вошёл и вышел с временем визита', () {
      final p = PresenceStore();
      var notified = 0;
      p.addListener(() => notified++);
      expect(p.handle({'type': 'ready', 'onlineMembers': [7, 9]}), isTrue);
      expect(p.isOnline(7) && p.isOnline(9), isTrue);
      p.handle({'type': 'presence:online', 'memberId': 12});
      expect(p.isOnline(12), isTrue);
      p.handle({'type': 'presence:offline', 'memberId': 7, 'lastSeenAt': '2026-11-22T10:00:00Z'});
      expect(p.isOnline(7), isFalse);
      expect(p.lastSeenOf(7), isNotNull);
      expect(notified, 3);
    });

    test('повторное то же самое слушателей не будит; чужие сообщения не трогает', () {
      final p = PresenceStore()..markOnline(1);
      var notified = 0;
      p.addListener(() => notified++);
      p.markOnline(1);
      p.setOnline([1]);
      expect(notified, 0);
      expect(p.handle({'type': 'msg:new'}), isFalse);
      expect(p.handle({'type': 'presence:online', 'memberId': 'не число'}), isTrue, reason: 'это присутствие, но с мусором — молча пропускаем');
      expect(p.isOnline(null), isFalse);
    });

    test('обрыв связи: статус «в сети» не показываем, пока не знаем правды', () {
      final p = PresenceStore()..setOnline([1, 2]);
      p.reset();
      expect(p.isOnline(1), isFalse);
    });
  });

  group('точка «в сети» в списке чатов', () {
    testWidgets('у личного чата — по статусу собеседника, и обновляется по событиям сокета; в группах нет', (tester) async {
      tester.view.physicalSize = const Size(360, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final semantics = tester.ensureSemantics();
      final s = SessionController();
      s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      final data = [_chat('1', 'private', 7, 'Анна'), _chat('2', 'private', 8, 'Пётр'), _chat('3', 'group', 0, 'Молодёжь')];
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(theme: churchTheme(brightness: Brightness.light), home: ChatsPage(actions: _Noop(), loadConversations: () async => data)),
      ));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const ValueKey('online-7')), findsNothing);

      s.realtime.debugReceive({'type': 'ready', 'memberId': 1, 'onlineMembers': [7]});
      await tester.pump();
      expect(find.byKey(const ValueKey('online-7')), findsOneWidget, reason: 'Анна в сети');
      expect(find.byKey(const ValueKey('online-8')), findsNothing);

      s.realtime.debugReceive({'type': 'presence:online', 'memberId': 8});
      await tester.pump();
      expect(find.byKey(const ValueKey('online-8')), findsOneWidget);

      s.realtime.debugReceive({'type': 'presence:offline', 'memberId': 7, 'lastSeenAt': '2026-11-22T10:00:00Z'});
      await tester.pump();
      expect(find.byKey(const ValueKey('online-7')), findsNothing, reason: 'Анна вышла');
      expect(tester.getSemantics(find.text('Пётр')).label, contains('в сети'), reason: 'скринридер тоже слышит статус');
      expect(tester.getSemantics(find.text('Анна')).label, isNot(contains('в сети')));
      semantics.dispose();
      expect(tester.takeException(), isNull);
    });
  });
}
