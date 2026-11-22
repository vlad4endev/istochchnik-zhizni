import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/drafts.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/core/typing.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:molitva/features/chats/data/chat_list_actions.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/thread_page.dart';
import 'package:molitva/features/chats/widgets/message_search.dart';
import 'package:molitva/features/chats/widgets/pinned_bar.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_chat.dart';

SessionController _session() {
  final s = SessionController();
  s.user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

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

Widget _host(SessionController s, Widget home, {double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: s,
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('«печатает…»', () {
    test('подписи: личный чат, один, двое, много', () {
      final t = TypingStore();
      addTearDown(t.dispose);
      expect(t.label('1', group: false), isNull);
      t.start('1', 2, 'Анна Орлова');
      expect(t.label('1', group: false), 'печатает…');
      expect(t.label('1', group: true), 'Анна печатает…');
      t.start('1', 3, 'Пётр Иванов');
      expect(t.label('1', group: true), 'Анна и Пётр печатают…');
      t.start('1', 4, 'Ольга');
      expect(t.label('1', group: true), '3 человека печатают…');
    });

    test('«стоп», пришедшее сообщение и обрыв связи гасят статус; сам гаснет по таймеру', () async {
      final t = TypingStore(ttl: const Duration(milliseconds: 40));
      addTearDown(t.dispose);
      t.handle({'type': 'typing:start', 'conversationId': '1', 'memberId': 2, 'memberName': 'Анна'});
      expect(t.isTyping('1'), isTrue);
      t.handle({'type': 'typing:stop', 'conversationId': '1', 'memberId': 2});
      expect(t.isTyping('1'), isFalse);
      t.start('1', 2, 'Анна');
      t.messageArrived('1', 2);
      expect(t.isTyping('1'), isFalse);
      t.start('1', 2, 'Анна');
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(t.isTyping('1'), isFalse, reason: 'если «стоп» потерялся — гаснет сам');
      t.start('1', 2, 'Анна');
      t.reset();
      expect(t.isTyping('1'), isFalse);
      expect(t.handle({'type': 'msg:new'}), isFalse);
    });
  });

  group('черновики', () {
    test('сохраняются на телефоне, возвращаются после перезапуска и стираются при выходе', () async {
      final a = DraftStore();
      await a.load(5);
      a.set('c1', 'Недописанное');
      a.set('c2', '   ');
      expect(a.has('c1'), isTrue);
      expect(a.has('c2'), isFalse, reason: 'пробелы — не черновик');
      await a.save();
      final b = DraftStore();
      await b.load(5);
      expect(b.textFor('c1'), 'Недописанное');
      final other = DraftStore();
      await other.load(6);
      expect(other.has('c1'), isFalse, reason: 'у другого аккаунта своих нет');
      await b.forget();
      final c = DraftStore();
      await c.load(5);
      expect(c.has('c1'), isFalse);
    });
  });

  group('поиск по чату', () {
    testWidgets('результаты с подсветкой; тап возвращает сообщение; пусто и ошибка — понятным текстом', (tester) async {
      final chat = FakeChat()
        ..searchNow = [SearchHit(message: msg('7', text: 'Встреча в субботу в церкви'))];
      String? picked;
      await tester.pumpWidget(_host(
        _session(),
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async => picked = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => ChatSearchPage(source: chat, conversationId: 'c1', debounce: Duration.zero))),
              child: const Text('открыть'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('открыть'));
      await tester.pumpAndSettle();
      expect(find.text('Введите хотя бы две буквы.'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('chat-search-field')), 'суббот');
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('search:суббот'));
      expect(find.textContaining('Встреча в', findRichText: true), findsOneWidget);
      await tester.tap(find.textContaining('Встреча в', findRichText: true));
      await tester.pumpAndSettle();
      expect(picked, '7');

      chat
        ..searchNow = []
        ..failSearch = false;
    });

    testWidgets('ничего не найдено и сбой сети', (tester) async {
      final chat = FakeChat();
      await tester.pumpWidget(_host(_session(), ChatSearchPage(source: chat, conversationId: 'c1', debounce: Duration.zero)));
      await tester.enterText(find.byKey(const ValueKey('chat-search-field')), 'нет такого');
      await tester.pumpAndSettle();
      expect(find.text('Ничего не найдено'), findsOneWidget);
      chat.failSearch = true;
      await tester.enterText(find.byKey(const ValueKey('chat-search-field')), 'ещё раз');
      await tester.pumpAndSettle();
      expect(find.text('Не удалось выполнить поиск'), findsOneWidget);
    });

    test('подсветка находит слово без учёта регистра', () {
      final span = highlightMatches('Привет, ПРИВЕТ', 'привет', const TextStyle(), const TextStyle(fontWeight: FontWeight.bold));
      final bold = (span.children ?? const []).whereType<TextSpan>().where((s) => s.style?.fontWeight == FontWeight.bold).length;
      expect(bold, 2);
    });
  });

  group('панель закреплённого', () {
    testWidgets('показывает текст и счёт «2 из 3»; тап и крестик работают', (tester) async {
      var taps = 0;
      var closes = 0;
      final list = [msg('3', text: 'Собрание в 10:00'), msg('2', text: 'Второе'), msg('1', text: 'Третье')];
      await tester.pumpWidget(_host(_session(), Scaffold(body: PinnedBar(pinned: list, index: 1, onTap: () => taps++, onClose: () => closes++))));
      expect(find.text('Закреплённое сообщение · 2 из 3'), findsOneWidget);
      expect(find.text('Второе'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('pinned-bar')));
      await tester.tap(find.byKey(const ValueKey('pinned-unpin')));
      expect((taps, closes), (1, 1));
    });

    testWidgets('пусто — панели нет; без права открепить крестика нет', (tester) async {
      await tester.pumpWidget(_host(_session(), Scaffold(body: PinnedBar(pinned: const [], index: 0, onTap: () {}))));
      expect(find.byKey(const ValueKey('pinned-bar')), findsNothing);
      await tester.pumpWidget(_host(_session(), Scaffold(body: PinnedBar(pinned: [msg('1', text: 'x')], index: 0, onTap: () {}))));
      expect(find.byKey(const ValueKey('pinned-unpin')), findsNothing);
    });
  });

  group('экран чата', () {
    Future<SessionController> open(WidgetTester tester, FakeChat chat, {double width = 360, double scale = 1}) async {
      tester.view.physicalSize = Size(width, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = _session();
      await tester.pumpWidget(_host(s, ThreadPage(key: UniqueKey(), conversationId: 'c1', title: 'Анна', type: 'private', otherMemberId: 2, source: chat, events: const Stream.empty()), width: width, scale: scale));
      await tester.pumpAndSettle();
      return s;
    }

    testWidgets('в шапке «печатает…» вместо статуса', (tester) async {
      final chat = FakeChat()
        ..metaNow = const ChatMeta(type: 'private', title: '')
        ..all = [msg('1')];
      final s = await open(tester, chat);
      s.realtime.debugReceive({'type': 'typing:start', 'conversationId': 'c1', 'memberId': 2, 'memberName': 'Анна'});
      await tester.pump();
      expect(find.text('печатает…', findRichText: true), findsOneWidget);
      s.realtime.debugReceive({'type': 'typing:stop', 'conversationId': 'c1', 'memberId': 2});
      await tester.pump();
      expect(find.text('печатает…', findRichText: true), findsNothing);
    });

    testWidgets('черновик возвращается при открытии и сохраняется при вводе', (tester) async {
      DraftStore.instance.set('c1', 'Недописал вчера');
      final chat = FakeChat()..all = [msg('1')];
      await open(tester, chat);
      expect(find.text('Недописал вчера'), findsOneWidget);
      await tester.enterText(find.byType(TextField).last, 'Новый текст');
      await tester.pump();
      expect(DraftStore.instance.textFor('c1'), 'Новый текст');
      DraftStore.instance.clear('c1');
      await DraftStore.instance.save();
    });

    testWidgets('закреплённое: панель видна, тап догружает старое сообщение и ведёт к нему', (tester) async {
      final all = [for (var i = 1; i <= 120; i++) msg('$i', text: 'Сообщение $i')];
      final chat = FakeChat()
        ..all = all
        ..pinnedNow = [all.first];
      await open(tester, chat);
      expect(find.byKey(const ValueKey('pinned-bar')), findsOneWidget);
      expect(find.text('Закреплённое сообщение'), findsOneWidget);
      chat.calls.clear();
      await tester.tap(find.byKey(const ValueKey('pinned-bar')));
      await tester.pumpAndSettle();
      expect(chat.calls.where((c) => c.startsWith('messages:')).length, greaterThan(0), reason: 'старые сообщения догружены, чтобы дойти до закреплённого');
      expect(tester.takeException(), isNull);
    });

    testWidgets('кнопка поиска открывает поиск по чату; без переполнений на 320 px и шрифте 2.0', (tester) async {
      final chat = FakeChat()..all = [msg('1')];
      await open(tester, chat, width: 320, scale: 2);
      await tester.tap(find.byTooltip('Поиск по чату'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('chat-search-field')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('список чатов', () {
    Map<String, dynamic> chat(String id, {String type = 'private', int peer = 7, String name = 'Анна', Map<String, dynamic>? last}) => {
          'id': id,
          'type': type,
          'title': type == 'private' ? '' : name,
          'other_member': type == 'private' ? {'id': peer, 'name': name} : null,
          'unread_count': 0,
          'last_message': last ?? {'content': 'Привет', 'sender_id': peer, 'created_at': '2026-11-22T10:00:00Z'},
        };

    Future<SessionController> open(WidgetTester tester, List<Map<String, dynamic>> data, {FakeChat? search}) async {
      tester.view.physicalSize = const Size(360, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final s = _session();
      await tester.pumpWidget(_host(s, ChatsPage(actions: _Noop(), loadConversations: () async => data, searchSource: search, searchDebounce: Duration.zero)));
      await tester.pump();
      await tester.pump();
      return s;
    }

    testWidgets('«печатает…» и «Черновик» вместо последнего сообщения', (tester) async {
      final s = await open(tester, [chat('1'), chat('2', name: 'Пётр', peer: 8)]);
      expect(find.text('Привет'), findsNWidgets(2));
      s.realtime.debugReceive({'type': 'typing:start', 'conversationId': '1', 'memberId': 7, 'memberName': 'Анна'});
      await tester.pump();
      expect(find.byKey(const ValueKey('row-typing')), findsOneWidget);
      DraftStore.instance.set('2', 'Не отправил\nещё');
      await tester.pump();
      expect(find.byKey(const ValueKey('row-draft')), findsOneWidget);
      expect(find.textContaining('Черновик: ', findRichText: true), findsOneWidget);
      DraftStore.instance.clear('2');
      s.realtime.typing.reset(); // таймер «печатает» не должен жить после теста
      await DraftStore.instance.save(); // и таймер сохранения черновиков тоже
    });

    testWidgets('своё последнее сообщение: «Вы:» в группе и галочки отправлено/прочитано', (tester) async {
      await open(tester, [
        chat('1', last: {'content': 'Я написал', 'sender_id': 9, 'created_at': '2026-11-22T10:00:00Z', 'read_by_others': true}),
        chat('2', type: 'group', name: 'Молодёжь', last: {'content': 'Едем', 'sender_id': 9, 'created_at': '2026-11-22T10:00:00Z', 'read_by_others': false}),
      ]);
      expect(find.byKey(const ValueKey('sent-read')), findsOneWidget);
      expect(find.byKey(const ValueKey('sent')), findsOneWidget);
      expect(find.text('Вы: Едем'), findsOneWidget);
      expect(find.text('Я написал'), findsOneWidget, reason: 'в личном чате «Вы:» не нужно');
    });

    testWidgets('поиск по тексту сообщений: раздел «Сообщения», тап открывает чат', (tester) async {
      final search = FakeChat()..searchNow = [SearchHit(message: msg('55', text: 'Встреча молодёжи завтра'), conversationTitle: 'Молодёжь')];
      await open(tester, [chat('c1', type: 'group', name: 'Молодёжь')], search: search);
      await tester.enterText(find.byType(TextField).first, 'встреча');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpAndSettle();
      expect(search.calls, contains('searchAll:встреча'));
      expect(find.byWidgetPredicate((w) => w is Text && (w.data ?? '').toLowerCase() == 'сообщения'), findsOneWidget);
      expect(find.byKey(const ValueKey('hit-55')), findsOneWidget);
    });
  });
}
