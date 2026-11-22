import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'call_alerts.dart';
import 'firebase_config.dart';
import 'nav.dart';
import 'push_nav.dart';
import 'push_route.dart';
import 'push_status.dart';
import 'session.dart';
import 'token_uploader.dart';

// Каналы создаёт нативный слой (NotificationChannels.kt) при каждом старте процесса.
// Здесь только идентификаторы; `_v2` — каналы со звуком и показом на экране блокировки.
const _messagesChannel = AndroidNotificationChannel(
  'messages_v2',
  'Сообщения',
  description: 'Новые сообщения в чатах',
  importance: Importance.high,
);

const _generalChannel = AndroidNotificationChannel(
  'general_v2',
  'Уведомления церкви',
  description: 'Лента, молитва, события и напоминания',
  importance: Importance.high,
);

/// Пуш пришёл, когда приложение закрыто или свёрнуто. Сообщения Android показывает
/// сам (в пуше есть блок notification); здесь только звонки — они приходят без него.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await ensureFirebase();
  final data = message.data;
  final invite = CallInvite.fromPush(data);
  if (invite != null) {
    await showNativeIncoming(invite);
    return;
  }
  final ended = CallInvite.endedCallId(data);
  if (ended != null) {
    await FlutterCallkitIncoming.endCall(ended);
  }
}

/// Регистрация устройства на сервере и обработка пушей в открытом приложении.
class PushService with WidgetsBindingObserver {
  PushService._() {
    _uploader = TokenUploader(send: _post, onChange: () => PushStatus.instance.setToken(registered: _uploader.registered));
  }
  static final PushService instance = PushService._();

  /// Открытый сейчас чат: уведомления о нём не показываем, человек и так его видит.
  static String? activeConversationId;

  final _local = FlutterLocalNotificationsPlugin();
  SessionController? _session;
  StreamSubscription<String>? _tokenRefresh;
  bool _started = false;
  late final TokenUploader _uploader;

  SessionController? get session => _session;

  /// Отправить токен на сервер сейчас. Возвращает null при успехе или текст причины.
  Future<String?> uploadToken(String token) async {
    final ok = await _uploader.submit(token);
    return ok ? null : (_uploader.lastError ?? 'сервер не принял токен');
  }

  Future<void> start(SessionController session) async {
    _session = session;
    PushNavigator.instance.attach(session);
    CallAlerts.instance.attach(session);
    if (_started || !await ensureFirebase()) return;
    _started = true;
    session.beforeLogout.add(unregister);
    session.afterLogin.add(register);

    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('ic_stat_notify')),
      onDidReceiveNotificationResponse: (response) => _openFromPayload(response.payload),
    );

    FirebaseMessaging.onMessage.listen(_onForeground);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _openFromData(m.data, m.notification?.title));
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      // Навигатор появляется после первого кадра.
      WidgetsBinding.instance.addPostFrameCallback((_) => _openFromData(initial.data, initial.notification?.title));
    }
    // Сервер (firebase-admin sendEachForMulticast) шлёт по классическим FCM-токенам,
    // а новый register()/onRegistered выдаёт Installation ID — с ним пуши не дойдут.
    // ignore: deprecated_member_use
    _tokenRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((token) => unawaited(_uploader.submit(token)));
    WidgetsBinding.instance.addObserver(this);
    unawaited(PushStatus.instance.refresh());
    WidgetsBinding.instance.addPostFrameCallback((_) => CallAlerts.instance.resumeAcceptedCall());
    if (session.user?.isActive == true) await register();
  }

  /// После входа: разрешения и токен устройства на сервер.
  Future<void> register() async {
    if (!_started || _session?.token == null) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
    } catch (_) {}
    try {
      // ignore: deprecated_member_use — см. комментарий у onTokenRefresh
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) {
        PushStatus.instance.setFirebaseProblem('Firebase не выдал токен устройства');
      } else {
        PushStatus.instance.setFirebaseProblem(null);
        _tokenAttempt = 0;
        await _uploader.submit(token);
      }
    } catch (e) {
      // Без Google Play Services или если проект Firebase не принял приложение пушей не будет;
      // приложение работает, а причина видна в профиле и на экране проверки.
      PushStatus.instance.setFirebaseProblem('Не удалось связаться с Firebase: ${_short(e)}');
      _scheduleTokenRetry();
    }
    await PushStatus.instance.refresh();
    await _askFullScreenCalls();
    _hintIfNotificationsOff();
  }

  Timer? _tokenRetry;
  int _tokenAttempt = 0;

  /// Сеть могла моргнуть именно в момент регистрации: повторяем с нарастающей паузой.
  void _scheduleTokenRetry() {
    const delays = [Duration(seconds: 20), Duration(minutes: 2), Duration(minutes: 10)];
    if (_tokenAttempt >= delays.length) return;
    _tokenRetry?.cancel();
    _tokenRetry = Timer(delays[_tokenAttempt++], () => unawaited(register()));
  }

  static String _short(Object e) {
    final text = e.toString().replaceAll('\n', ' ');
    return text.length > 160 ? '${text.substring(0, 160)}…' : text;
  }

  /// Вернулись в приложение: человек мог включить разрешение в настройках или появилась сеть.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !_started) return;
    unawaited(PushStatus.instance.refresh());
    if (_session?.token == null) return;
    if (_uploader.hasToken) {
      unawaited(_uploader.retryNow());
    } else {
      unawaited(register());
    }
  }

  /// Уведомления выключены в системе: без них не придут ни сообщения, ни звонки.
  /// Напоминаем не чаще раза в неделю и всегда оставляем кнопку в профиле.
  Future<void> _hintIfNotificationsOff() async {
    if (PushStatus.instance.notificationsAllowed != false) return;
    if (!await _dueAgain('hinted_notifications_off')) return;
    final context = navigatorKey.currentContext;
    if (context == null || !context.mounted) return;
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        duration: const Duration(seconds: 10),
        content: const Text('Уведомления выключены — сообщения и звонки не придут.'),
        action: SnackBarAction(label: 'Включить', onPressed: PushStatus.instance.openNotificationSettings),
      ));
  }

  /// Не чаще раза в [days] дней; отметка ставится при проверке.
  Future<bool> _dueAgain(String key, {int days = 7}) async {
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getInt(key) ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - last < Duration(days: days).inMilliseconds) return false;
    await prefs.setInt(key, now);
    return true;
  }

  /// Android 14+: без этого разрешения звонок не откроется поверх экрана блокировки.
  /// Объясняем зачем, и только потом отправляем в системные настройки. Спрашиваем один раз.
  Future<void> _askFullScreenCalls() async {
    try {
      if (await FlutterCallkitIncoming.canUseFullScreenIntent()) return;
      // Раньше спрашивали один раз навсегда; теперь повторяем раз в неделю, пока не разрешат.
      if (!await _dueAgain('asked_full_screen_calls_at')) return;
      final context = navigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      final allow = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Звонки на весь экран'),
          content: const Text(
            'Чтобы входящий звонок появлялся поверх экрана блокировки, как в мессенджерах, '
            'разрешите это в следующем окне настроек.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Позже')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Разрешить')),
          ],
        ),
      );
      if (allow == true) await PushStatus.instance.openFullScreenSettings();
    } catch (_) {}
  }

  /// Бросает исключение при сбое — [TokenUploader] повторит попытку.
  Future<void> _post(String token) async {
    final session = _session;
    if (session?.token == null) throw StateError('нет сессии');
    await session!.dio.post<Object?>(
      '/api/notifications/save-token',
      data: {'fcm_token': token, 'device_id': await deviceId()},
    );
  }

  /// Перед выходом: устройство больше не должно получать пуши этого человека.
  Future<void> unregister() async {
    final session = _session;
    if (session == null) return;
    try {
      await session.dio.post<Object?>('/api/notifications/remove-token', data: {'device_id': await deviceId()});
    } catch (_) {}
    try {
      // ignore: deprecated_member_use — пара к getToken
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
    _uploader.reset();
  }

  static Future<String> deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('push_device_id');
    if (id == null || id.isEmpty) {
      final random = Random.secure();
      id = 'flutter-${List.generate(16, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
      await prefs.setString('push_device_id', id);
    }
    return id;
  }

  /// Пришло напоминание — связанные разделы подтягиваются фоном и обновляются на экране.
  void _refreshCachedFor(Map<String, dynamic> data) {
    final prefixes = cachePrefixesFor(resolvePushTarget(data));
    if (prefixes.isEmpty) return;
    unawaited(_session?.cache.revalidate((path) => prefixes.any(path.startsWith)));
  }

  Future<void> _onForeground(RemoteMessage message) async {
    final data = message.data;
    final invite = CallInvite.fromPush(data);
    if (invite != null) {
      CallAlerts.instance.showInApp(invite);
      return;
    }
    final ended = CallInvite.endedCallId(data);
    if (ended != null) {
      await CallAlerts.instance.endNative(ended);
      return;
    }
    _refreshCachedFor(data);
    final title = message.notification?.title ?? '${data['title'] ?? ''}';
    final body = message.notification?.body ?? '${data['body'] ?? ''}';
    if (title.isEmpty && body.isEmpty) return;
    final conversationId = '${data['conversationId'] ?? ''}';
    if (conversationId.isNotEmpty && conversationId == activeConversationId) return;
    final channel = conversationId.isNotEmpty ? _messagesChannel : _generalChannel;
    await _local.show(
      id: (data['tag'] ?? message.messageId ?? title).hashCode & 0x7fffffff,
      title: title,
      body: body,
      payload: jsonEncode({...data.map((k, v) => MapEntry(k, '$v')), 'title': title}),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          visibility: NotificationVisibility.public,
          category: conversationId.isNotEmpty ? AndroidNotificationCategory.message : AndroidNotificationCategory.reminder,
          styleInformation: BigTextStyleInformation(body),
          color: const Color(0xFF8A2742),
          icon: 'ic_stat_notify',
          largeIcon: const DrawableResourceAndroidBitmap('ic_notification_large'),
        ),
      ),
    );
  }

  /// Нажатие на уведомление, которое показало приложение (оно было открыто).
  void _openFromPayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(payload);
      if (decoded is! Map) return;
      data = Map<String, dynamic>.from(decoded);
    } catch (_) {
      // Прежний формат «идентификатор|заголовок» — уведомления, показанные старой версией.
      final index = payload.indexOf('|');
      if (index < 0) return;
      data = {'conversationId': payload.substring(0, index), 'title': payload.substring(index + 1)};
    }
    _openFromData(data, '${data['title'] ?? ''}');
  }

  /// Нажатие на уведомление системы: данные пуша → нужный экран приложения.
  void _openFromData(Map<String, dynamic> data, String? title) {
    if (CallInvite.fromPush(data) != null) return;
    PushNavigator.instance.open(resolvePushTarget(data), title: (title == null || title.isEmpty) ? '${data['title'] ?? ''}' : title);
  }

  Future<void> dispose() async {
    WidgetsBinding.instance.removeObserver(this);
    _uploader.dispose();
    await _tokenRefresh?.cancel();
  }
}
