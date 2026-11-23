import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:molitva/features/chats/data/chat_list_actions.dart';
import 'package:molitva/features/chats/logic/chat_list_menu.dart';
import 'package:provider/provider.dart';

class _Actions implements ChatListActions {
  _Actions(this.data);
  final List<Map<String, dynamic>> data;
  final calls = <String>[];
  bool fail = false;

  void _set(String id, String key, Object value) {
    for (final c in data) {
      if (c['id'] == id) c[key] = value;
    }
  }

  Future<void> _do(String c) async {
    if (fail) throw Exception('net');
    calls.add(c);
  }

  @override
  Future<void> setPinned(String id, bool pinned) async {
    await _do('pin:$id:$pinned');
    _set(id, 'my_ui_pinned', pinned);
  }
  @override
  Future<void> setMuted(String id, bool muted) async {
    await _do('mute:$id:$muted');
    _set(id, 'my_muted', muted);
  }
  @override
  Future<void> clearHistory(String id) => _do('clear:$id');
  @override
  Future<void> leave(String id) => _do('leave:$id');
}

Map<String, dynamic> _chat(String id, String type, {String name = 'Анна', bool pinned = false, bool muted = false, String role = 'member'}) => {
      'id': id,
      'type': type,
      'title': type == 'private' ? '' : name,
      'other_member': type == 'private' ? {'id': 7, 'name': name} : null,
      'my_ui_pinned': pinned,
      'my_muted': muted,
      'my_role': role,
      'unread_count': 0,
      'last_message': {'content': 'Привет', 'created_at': DateTime.now().toUtc().toIso8601String()},
    };

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  group('модель меню (правила как на сайте)', () {
    test('закрепить/открепить и звук зависят от текущего состояния', () {
      final off = ChatListMenuModel.from(_chat('1', 'private'));
      expect((off.pinLabel, off.muteLabel), ('Закрепить', 'Убрать звук'));
      final on = ChatListMenuModel.from(_chat('1', 'private', pinned: true, muted: true));
      expect((on.pinLabel, on.muteLabel), ('Открепить', 'Включить звук'));
    });

    test('создатель группы или канала удаляет их у всех, остальные просто выходят', () {
      expect(ChatListMenuModel.from(_chat('1', 'group', role: 'owner')).deleteLabel, 'Удалить группу');
      expect(ChatListMenuModel.from(_chat('1', 'channel', role: 'owner')).deleteLabel, 'Удалить канал');
      expect(ChatListMenuModel.from(_chat('1', 'group', role: 'admin')).deleteLabel, 'Удалить чат');
      expect(ChatListMenuModel.from(_chat('1', 'private', role: 'owner')).deleteLabel, 'Удалить чат');
      expect(ChatListMenuModel.from(_chat('1', 'group', role: 'owner')).ownerDeletes, isTrue);
      expect(ChatListMenuModel.from(_chat('1', 'group')).deleteConfirmText, contains('по приглашению'));
    });

    test('applyChatPreference меняет только переданное', () {
      final r = applyChatPreference(_chat('1', 'group'), pinned: true);
      expect((r['my_ui_pinned'], r['my_muted']), (true, false));
    });
  });

  group('долгое нажатие в списке чатов', () {
    late _Actions actions;
    late List<Map<String, dynamic>> data;

    Future<void> pump(WidgetTester tester, {double width = 360, double scale = 1}) async {
      tester.view.physicalSize = Size(width, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = SessionController();
      s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: MediaQuery(
            data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)),
            child: ChatsPage(actions: actions, loadConversations: () async => data),
          ),
        ),
      ));
      await tester.pump();
      await tester.pump();
    }

    setUp(() {
      data = [_chat('1', 'private', name: 'Анна'), _chat('2', 'group', name: 'Молодёжь', role: 'owner')];
      actions = _Actions(data);
    });

    testWidgets('меню открывается и показывает все четыре действия; без переполнений на 320 px и шрифте 2.0', (tester) async {
      await pump(tester, width: 320, scale: 2);
      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      for (final k in ['pin', 'mute', 'clear', 'delete']) {
        expect(find.byKey(ValueKey('chat-menu-$k')), findsOneWidget, reason: k);
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('закрепить: запрос на сервер, в строке появляется булавка', (tester) async {
      await pump(tester);
      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-pin')));
      await tester.pumpAndSettle();
      expect(actions.calls, ['pin:1:true']);
      expect(find.byIcon(Icons.push_pin), findsOneWidget);
    });

    testWidgets('убрать звук: значок выключенного звука в строке', (tester) async {
      await pump(tester);
      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-mute')));
      await tester.pumpAndSettle();
      expect(actions.calls, ['mute:1:true']);
      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);
    });

    testWidgets('очистить: сначала подтверждение; «Отмена» ничего не отправляет', (tester) async {
      await pump(tester);
      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-clear')));
      await tester.pumpAndSettle();
      expect(find.text('Очистить переписку?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('chat-confirm-cancel')));
      await tester.pumpAndSettle();
      expect(actions.calls, isEmpty);

      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-clear')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-confirm-ok')));
      await tester.pumpAndSettle();
      expect(actions.calls, ['clear:1']);
    });

    testWidgets('удалить группу (создатель): подтверждение с «Удалить группу?», чат исчезает из списка', (tester) async {
      await pump(tester);
      await tester.longPress(find.text('Молодёжь'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-delete')));
      await tester.pumpAndSettle();
      expect(find.text('Удалить группу?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('chat-confirm-ok')));
      await tester.pumpAndSettle();
      expect(actions.calls, ['leave:2']);
      expect(find.text('Молодёжь'), findsNothing);
      expect(find.text('Анна'), findsOneWidget);
    });

    testWidgets('сбой сервера: понятное сообщение, чат остаётся в списке', (tester) async {
      actions.fail = true;
      await pump(tester);
      await tester.longPress(find.text('Анна'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-menu-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('chat-confirm-ok')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не получилось'), findsOneWidget);
      expect(find.text('Анна'), findsOneWidget);
    });
  });
}
