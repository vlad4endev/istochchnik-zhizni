import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/calls/call_page.dart';
import 'nav.dart';
import 'session.dart';

/// Данные входящего звонка из пуша `incoming_call` или события `call:incoming`.
@immutable
class CallInvite {
  const CallInvite({
    required this.callId,
    required this.callerName,
    required this.video,
    this.conversationId = '',
    this.callerAvatar = '',
  });

  final String callId;
  final String callerName;
  final bool video;
  final String conversationId;
  final String callerAvatar;

  /// Разбор данных FCM (`callId`, `callerName`, `callType`, …). Null — не звонок.
  static CallInvite? fromPush(Map<String, dynamic> data) {
    if ('${data['type'] ?? ''}' != 'incoming_call') return null;
    final callId = '${data['callId'] ?? ''}'.trim();
    if (callId.isEmpty) return null;
    final name = '${data['callerName'] ?? data['body'] ?? ''}'.trim();
    return CallInvite(
      callId: callId,
      callerName: name.isEmpty ? 'Собеседник' : name,
      video: '${data['callType'] ?? ''}' == 'video',
      conversationId: '${data['conversationId'] ?? ''}',
      callerAvatar: '${data['callerAvatar'] ?? ''}',
    );
  }

  /// Пуш о том, что звонок больше не актуален: снять звонилку.
  static String? endedCallId(Map<String, dynamic> data) {
    final type = '${data['type'] ?? ''}';
    if (type != 'call_ended' && type != 'call_cancelled' && type != 'call_missed') return null;
    final id = '${data['callId'] ?? ''}'.trim();
    return id.isEmpty ? null : id;
  }

  CallKitParams toParams() => CallKitParams(
        id: callId,
        nameCaller: callerName,
        appName: 'Моя церковь',
        // Без фото звонящего — логотип церкви (файл из ресурсов приложения).
        avatar: callerAvatar.isEmpty ? 'assets/images/logo.png' : callerAvatar,
        handle: video ? 'Видеозвонок' : 'Аудиозвонок',
        type: video ? 1 : 0,
        duration: 60000,
        missedCallNotification: const NotificationParams(
          showNotification: true,
          isShowCallback: false,
          subtitle: 'Пропущенный звонок',
        ),
        extra: {
          'callId': callId,
          'conversationId': conversationId,
          'video': video,
          'callerName': callerName,
        },
        android: const AndroidParams(
          isCustomNotification: true,
          isShowLogo: true,
          logoUrl: 'assets/images/logo.png',
          isShowCallID: true,
          backgroundColor: '#4A1224',
          backgroundUrl: 'assets/call/call_background.png',
          actionColor: '#2FBF71',
          textColor: '#FFFFFF',
          incomingCallNotificationChannelName: 'Входящие звонки',
          missedCallNotificationChannelName: 'Пропущенные звонки',
          isShowFullLockedScreen: true,
          isImportant: true,
          textAccept: 'Ответить',
          textDecline: 'Отклонить',
        ),
        ios: const IOSParams(handleType: 'generic', supportsVideo: true, audioSessionMode: 'voiceChat'),
      );

  static CallInvite fromParams(CallKitParams params) {
    final extra = params.extra ?? const {};
    return CallInvite(
      callId: '${extra['callId'] ?? params.id}',
      callerName: params.nameCaller ?? 'Собеседник',
      video: extra['video'] == true || params.type == 1,
      conversationId: '${extra['conversationId'] ?? ''}',
      callerAvatar: params.avatar ?? '',
    );
  }
}

/// Системная звонилка (полный экран поверх блокировки, рингтон) — как в мессенджерах.
/// Когда приложение открыто, звонок показывается своим экраном [CallPage].
class CallAlerts {
  CallAlerts._();
  static final CallAlerts instance = CallAlerts._();

  final Set<String> _handled = {};
  final Set<String> _openPages = {};
  StreamSubscription<CallEvent?>? _events;
  SessionController? _session;

  bool get _native => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  void attach(SessionController session) {
    _session = session;
    if (!_native || _events != null) return;
    _events = FlutterCallkitIncoming.onEvent.listen(_onEvent);
  }

  /// Принят ли звонок, пока приложение было закрыто: открыть разговор сразу.
  Future<void> resumeAcceptedCall() async {
    if (!_native) return;
    try {
      final calls = await FlutterCallkitIncoming.activeCalls();
      for (final call in calls) {
        if (call.isAccepted) {
          openCall(CallInvite.fromParams(call), accepted: true);
          return;
        }
      }
    } catch (_) {}
  }

  /// Входящий, пока приложение на экране (сокет или пуш в foreground).
  void showInApp(CallInvite invite) {
    if (_handled.contains(invite.callId) || _openPages.contains(invite.callId)) return;
    _handled.add(invite.callId);
    openCall(invite, accepted: false);
  }

  void openCall(CallInvite invite, {required bool accepted}) {
    if (_openPages.contains(invite.callId)) return;
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    _openPages.add(invite.callId);
    nav
        .push(MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => CallPage(
            callId: invite.callId,
            conversationId: invite.conversationId.isEmpty ? null : invite.conversationId,
            incoming: true,
            autoAccept: accepted,
            video: invite.video,
            title: invite.callerName,
          ),
        ))
        .whenComplete(() {
      _openPages.remove(invite.callId);
      endNative(invite.callId);
    });
  }

  /// Снять системную звонилку и уведомление о звонке.
  Future<void> endNative(String callId) async {
    if (!_native) return;
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } catch (_) {}
  }

  Future<void> _onEvent(CallEvent? event) async {
    switch (event) {
      case CallEventActionCallAccept(:final callKitParams):
        final invite = CallInvite.fromParams(callKitParams);
        _handled.add(invite.callId);
        openCall(invite, accepted: true);
      case CallEventActionCallDecline(:final callKitParams):
        final session = _session;
        final id = CallInvite.fromParams(callKitParams).callId;
        _handled.add(id);
        if (session != null) {
          await declineCallRequest(dio: session.dio, callId: id);
        }
      default:
        break;
    }
  }
}

Future<void> declineCallRequest({required Dio dio, required String callId}) async {
  try {
    await dio.post<Object?>('/api/calls/$callId/decline');
  } catch (_) {
    /* звонок мог уже завершиться — это не ошибка для пользователя */
  }
}

/// Показ звонилки из фонового пуша, когда Flutter-интерфейса нет.
Future<void> showNativeIncoming(CallInvite invite) async {
  await FlutterCallkitIncoming.showCallkitIncoming(invite.toParams());
}

/// «Отклонить» на звонилке, когда приложение закрыто: отдельный isolate без сессии,
/// поэтому адрес сервера и токен читаются из хранилища напрямую.
@pragma('vm:entry-point')
Future<void> callKitBackgroundHandler(CallEvent event) async {
  if (event is! CallEventActionCallDecline) return;
  final id = CallInvite.fromParams(event.callKitParams).callId;
  final prefs = await SharedPreferences.getInstance();
  final origin = (prefs.getString('api_origin') ?? defaultApiOrigin).trim();
  String? token;
  try {
    token = await const FlutterSecureStorage().read(key: 'auth_token');
  } catch (_) {}
  if (token == null || token.isEmpty) return;
  final dio = Dio(BaseOptions(
    baseUrl: origin.isEmpty ? defaultApiOrigin : origin,
    connectTimeout: const Duration(seconds: 15),
    headers: {'Authorization': 'Bearer $token', 'Accept': 'application/json'},
  ));
  await declineCallRequest(dio: dio, callId: id);
}
