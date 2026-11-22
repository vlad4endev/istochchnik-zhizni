import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'call_alerts.dart';
import 'session.dart';

class ChurchRealtime {
  ChurchRealtime(this.session);
  final SessionController session;

  WebSocketChannel? _channel;
  Timer? _ping;
  StreamSubscription<dynamic>? _sub;
  bool _stopped = true;
  final _callEvents = StreamController<Map<String, dynamic>>.broadcast();
  final _chatEvents = StreamController<Map<String, dynamic>>.broadcast();

  /// События чатов из сокета (новое, изменённое и удалённое сообщение, реакции, прочтение):
  /// открытый чат перечитывает себя сам.
  Stream<Map<String, dynamic>> get chatEvents => _chatEvents.stream;

  /// Для тестов: подать событие чата так, будто оно пришло из сокета.
  void debugEmitChat(Map<String, dynamic> event) => _chatEvents.add(event);

  /// События звонков из сокета: отмена, отказ, завершение — экран звонка закрывается сам.
  Stream<Map<String, dynamic>> get callEvents => _callEvents.stream;

  void start() {
    final token = session.token;
    if (token == null || token.isEmpty) return;
    stop();
    _stopped = false;
    final origin = Uri.tryParse(session.apiOrigin);
    if (origin == null || origin.host.isEmpty) return;
    final socketUri = origin.replace(
      scheme: origin.scheme == 'https' ? 'wss' : 'ws',
      path: '/api/realtime',
    );
    try {
      final channel = WebSocketChannel.connect(socketUri);
      _channel = channel;
      // Сбой соединения приходит и в `ready`, и в поток; повтор запускает поток, а здесь ошибку гасим,
      // иначе без сети она остаётся необработанной.
      unawaited(channel.ready.then<void>((_) {}, onError: (Object _) {}));
      channel.sink.add(jsonEncode({'type': 'auth', 'token': token}));
      _sub = channel.stream.listen(_onMessage, onDone: _retry, onError: (_) => _retry());
      _ping = Timer.periodic(const Duration(seconds: 20), (_) {
        if (_stopped) return;
        try {
          channel.sink.add(jsonEncode({'type': 'ping'}));
        } catch (_) {}
      });
    } catch (_) {
      _retry();
    }
  }

  void stop() {
    _stopped = true;
    _ping?.cancel();
    _ping = null;
    _sub?.cancel();
    _sub = null;
    final channel = _channel;
    _channel = null;
    channel?.sink.close();
  }

  void _retry() {
    if (_stopped) return;
    Future<void>.delayed(const Duration(seconds: 4), () {
      if (!_stopped) start();
    });
  }

  void _onMessage(dynamic raw) {
    Map<String, dynamic> message;
    try {
      final decoded = raw is String ? jsonDecode(raw) : raw;
      if (decoded is! Map) return;
      message = Map<String, dynamic>.from(decoded);
    } catch (_) {
      return;
    }
    final type = '${message['type'] ?? ''}';
    if (type.startsWith('call:')) _callEvents.add(message);
    if (type.startsWith('msg:') || type.startsWith('conv:') || type.startsWith('read:') || type == 'messages_read') {
      _chatEvents.add(message);
    }
    if (type == 'call:incoming') {
      final callId = '${message['callId'] ?? ''}'.trim();
      if (callId.isEmpty) return;
      final name = '${message['callerName'] ?? ''}'.trim();
      CallAlerts.instance.showInApp(CallInvite(
        callId: callId,
        callerName: name.isEmpty ? 'Входящий звонок' : name,
        video: message['callType'] == 'video',
        conversationId: '${message['conversationId'] ?? ''}',
      ));
    }
  }
}
