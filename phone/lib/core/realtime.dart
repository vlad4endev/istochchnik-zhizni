import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../features/calls/call_page.dart';
import 'nav.dart';
import 'session.dart';

class ChurchRealtime {
  ChurchRealtime(this.session);
  final SessionController session;

  WebSocketChannel? _channel;
  Timer? _ping;
  StreamSubscription<dynamic>? _sub;
  bool _stopped = true;
  bool _ringing = false;

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
    if (message['type'] == 'call:incoming' && !_ringing) {
      final callId = '${message['callId'] ?? ''}'.trim();
      if (callId.isEmpty) return;
      final nav = navigatorKey.currentState;
      if (nav == null) return;
      _ringing = true;
      nav
          .push(MaterialPageRoute<void>(
            fullscreenDialog: true,
            builder: (_) => CallPage(
              callId: callId,
              incoming: true,
              title: '${message['callerName'] ?? 'Входящий звонок'}',
              video: message['callType'] == 'video',
            ),
          ))
          .whenComplete(() => _ringing = false);
    }
  }
}
