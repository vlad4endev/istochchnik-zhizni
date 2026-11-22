import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/cache_watch.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chats_page.dart';
import 'package:molitva/features/chats/data/chat_list_actions.dart';
import 'package:molitva/features/events/events_page.dart';
import 'package:provider/provider.dart';

/// Сервер, который может «молчать»: пока [hold] включён, ответы ждут [release].
class _SlowNet implements HttpClientAdapter {
  final routes = <String, Object?>{};
  int calls = 0;
  bool hold = false;
  Completer<void> _gate = Completer<void>();

  void release() {
    hold = false;
    if (!_gate.isCompleted) _gate.complete();
    _gate = Completer<void>();
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls++;
    if (hold) await _gate.future;
    final body = routes[options.path];
    if (body == null) return ResponseBody.fromString('{}', 404, headers: {Headers.contentTypeHeader: ['application/json']});
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

SessionController _session(_SlowNet net) {
  final s = SessionController(cacheRecheckAfter: Duration.zero);
  s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  s.dio.httpClientAdapter = net;
  return s;
}

Map<String, dynamic> _event(int id) => {
      'id': id,
      'title': 'Событие $id',
      'event_date': DateTime.now().add(Duration(days: id + 1)).toIso8601String().substring(0, 10),
    };

Widget _app(SessionController s, Widget home) => ChangeNotifierProvider.value(
      value: s,
      child: MaterialApp(theme: churchTheme(brightness: Brightness.light), home: home),
    );

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

/// Ждём, пока условие выполнится (до 3 с реального времени), отрисовывая кадры.
Future<void> _until(WidgetTester tester, bool Function() done) async {
  for (var i = 0; i < 150 && !done(); i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  testWidgets('раздел открывается мгновенно с сохранённым, а новое подхватывает сам', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final net = _SlowNet()..routes['/api/calendar/events'] = [_event(1)];
    final session = _session(net);
    bool shown(String text) => find.text(text).evaluate().isNotEmpty;

    // Первый раз: сохранённого нет, ждём сервер.
    await tester.pumpWidget(_app(session, const EventsPage()));
    await _until(tester, () => shown('Впереди: 1'));
    expect(find.text('Впереди: 1'), findsOneWidget);

    // Закрыли раздел; на сервере появилось второе мероприятие, и сервер «замолчал».
    await tester.pumpWidget(const SizedBox());
    net.routes['/api/calendar/events'] = [_event(1), _event(2)];
    net.hold = true;

    // Открыли снова: ответа сервера нет, а экран уже заполнен сохранённым.
    await tester.pumpWidget(_app(session, const EventsPage()));
    await _until(tester, () => shown('Впереди: 1'));
    expect(find.text('Впереди: 1'), findsOneWidget, reason: 'сначала то, что уже было — не ждём сервер');

    // Сервер ответил — экран обновился сам, без нажатий.
    net.release();
    await _until(tester, () => shown('Впереди: 2'));
    expect(find.text('Впереди: 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('новое сообщение в сокете: список чатов обновляется сам', (tester) async {
    final net = _SlowNet()
      ..routes['/api/messenger/conversations'] = [
        {'id': '1', 'type': 'private', 'title': '', 'other_member': {'id': 7, 'name': 'Анна'}, 'unread_count': 0, 'last_message': {'content': 'Привет', 'created_at': '2026-11-22T10:00:00Z'}},
      ];
    final session = _session(net);
    bool shown(String text) => find.text(text).evaluate().isNotEmpty;
    await tester.pumpWidget(_app(session, ChatsPage(actions: _Noop())));
    await _until(tester, () => shown('Привет'));
    expect(find.text('Привет'), findsOneWidget);

    net.routes['/api/messenger/conversations'] = [
      {'id': '1', 'type': 'private', 'title': '', 'other_member': {'id': 7, 'name': 'Анна'}, 'unread_count': 1, 'last_message': {'content': 'Ты где?', 'created_at': '2026-11-22T10:05:00Z'}},
    ];
    session.realtime.debugEmitChat({'type': 'msg:new', 'conversationId': '1'});
    await _until(tester, () => shown('Ты где?'));
    expect(find.text('Ты где?'), findsOneWidget, reason: 'не нужно уходить и возвращаться в раздел');
    expect(find.text('Привет'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('CacheWatcher: реагирует только на свои адреса и отписывается при закрытии', (tester) async {
    final net = _SlowNet();
    final session = _session(net);
    var hits = 0;
    await tester.pumpWidget(_app(session, _Probe(onChange: () => hits++)));
    // Сетевые вызовы — в реальном времени, а не в «поддельном» времени теста.
    await tester.runAsync(() async {
      net.routes['/api/feed'] = {'posts': [1]};
      await session.dio.get<Object?>('/api/feed');
      net.routes['/api/feed'] = {'posts': [1, 2]};
      await session.dio.get<Object?>('/api/feed'); // отдаст сохранённое и спросит сервер фоном
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump(const Duration(milliseconds: 400));
    expect(hits, 1, reason: 'адрес /api/feed — свой');

    await tester.pumpWidget(const SizedBox());
    session.cache.invalidate('/api/feed');
    await tester.pump(const Duration(milliseconds: 400));
    expect(hits, 1, reason: 'после закрытия экран не реагирует');
  });
}

class _Probe extends StatefulWidget {
  const _Probe({required this.onChange});
  final VoidCallback onChange;
  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> with CacheWatcher<_Probe> {
  @override
  void initState() {
    super.initState();
    watchCache(const ['/api/feed'], widget.onChange);
  }

  @override
  Widget build(BuildContext context) => const SizedBox();
}
