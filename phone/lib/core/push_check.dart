import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'firebase_config.dart';
import 'json.dart';
import 'push.dart';
import 'push_status.dart';

/// Шаг проверки уведомлений: что проверяли, получилось ли и что делать.
class PushCheckStep {
  const PushCheckStep({required this.title, required this.ok, required this.detail, this.hint});

  final String title;
  final bool ok;
  final String detail;

  /// Что сделать, если шаг не прошёл.
  final String? hint;
}

/// Всё, что проверка берёт у устройства и сервера; в тестах подменяется.
abstract class PushCheckEnv {
  Future<bool?> notificationsAllowed();
  Future<String?> firebaseAppId();

  /// Достучался ли телефон до Google: `installations` — регистрация (HTTPS), `mtalk` — доставка пушей (TCP 5228).
  Future<({bool installations, bool mtalk})> googleReachable();

  /// Что система запомнила про каналы: id, importance, hasSound, lockscreenPublic.
  Future<List<Map<String, dynamic>>> channels();
  Future<String> token();
  Future<String?> uploadToken(String token);
  Future<Map<String, dynamic>> serverStatus();
  Future<Map<String, dynamic>> sendTest();
}

/// Расшифровка кодов ошибок FCM, которые возвращает сервер в сводке теста.
String explainFcmError(String code) {
  final c = code.toLowerCase();
  if (c.contains('registration-token-not-registered') || c.contains('not-registered')) {
    return 'Токен устарел или приложение переустановлено. Выйдите из аккаунта и войдите снова.';
  }
  if (c.contains('third-party-auth') || c.contains('apns')) return 'Сервер не принят Apple/Google для этого устройства.';
  if (c.contains('mismatched-credential') || c.contains('sender-id')) {
    return 'Токен выдан другим проектом Firebase, чем настроен на сервере (не совпадает проект).';
  }
  if (c.contains('invalid-argument') || c.contains('invalid-registration')) return 'Сервер получил некорректный токен устройства.';
  if (c.contains('unavailable') || c.contains('internal')) return 'Сервис Google временно недоступен, повторите позже.';
  if (c.contains('quota')) return 'Превышена квота отправки Firebase.';
  return code;
}

/// Человеческая сводка ответа `/api/notifications/test` по каналу FCM.
({bool ok, String detail, String? hint}) interpretTest(Map<String, dynamic> response) {
  final fcm = asMap(asMap(response['summary'])['fcm']);
  final attempted = asInt(fcm['attempted']);
  final sent = asInt(fcm['sent']);
  final failed = asInt(fcm['failed']);
  final errors = [for (final e in asList(fcm['errors'])) str(e)].where((e) => e.isNotEmpty).toList();
  if (attempted == 0) {
    return (ok: false, detail: 'На сервере нет токена этого устройства.', hint: 'Выйдите из аккаунта и войдите снова, затем повторите проверку.');
  }
  if (sent > 0 && failed == 0) {
    return (
      ok: true,
      detail: 'Сервер отправил пуш ($sent). Он должен появиться в шторке через несколько секунд.',
      hint: 'Если пуш не появился: проверьте, что для приложения разрешены уведомления и нет ограничения батареи («Без ограничений»).',
    );
  }
  final why = errors.isEmpty ? 'причина не указана' : errors.map(explainFcmError).join(' ');
  return (ok: false, detail: 'Отправлено: $sent, не доставлено: $failed. $why', hint: null);
}

/// Читаемая причина сбоя запроса к серверу.
String describeRequestError(Object e) {
  if (e is DioException) {
    final code = e.response?.statusCode;
    final body = e.response?.data;
    final msg = body is Map ? str(body['error']) : '';
    if (code != null) return 'сервер ответил $code${msg.isEmpty ? '' : ': $msg'}';
    return 'нет связи с сервером (${e.type.name})';
  }
  return e.toString().replaceAll('\n', ' ');
}

/// Подсказка по тексту ошибки получения токена Firebase.
String explainTokenError(String message) {
  final m = message.toLowerCase();
  if (m.contains('service_not_available') || m.contains('registration failed') || m.contains('ioexception')) {
    return 'Телефон не смог зарегистрироваться в Google. Обычно это сеть или ограничения: смените Wi‑Fi на мобильную сеть (или наоборот), выключите VPN и блокировщики, '
        'в настройках телефона откройте «Google Play Сервисы» → «Батарея» → «Без ограничений», включите фоновые данные, перезагрузите телефон.';
  }
  if (m.contains('authentication_failed') || m.contains('api key') || m.contains('permission_denied') || m.contains('403')) {
    return 'Google не принял ключ приложения (ограничение ключа по пакету или подписи). Нужно разрешить пакет в консоли Firebase — сообщите администратору.';
  }
  if (m.contains('too_many_registrations')) return 'Слишком много устройств на аккаунте Google. Удалите старые устройства и повторите.';
  return 'Проверьте интернет и Google Play Services.';
}

/// Шаг про связь с Google: показывает, блокирует ли сеть регистрацию или доставку пушей.
PushCheckStep describeGoogle(({bool installations, bool mtalk}) r) {
  if (r.installations && r.mtalk) {
    return const PushCheckStep(title: 'Связь с Google', ok: true, detail: 'Регистрация и доставка пушей доступны.');
  }
  final bad = <String>[
    if (!r.installations) 'регистрация (firebaseinstallations.googleapis.com) недоступна',
    if (!r.mtalk) 'канал доставки пушей (mtalk.google.com:5228) закрыт',
  ];
  return PushCheckStep(
    title: 'Связь с Google',
    ok: false,
    detail: 'Не достучались: ${bad.join('; ')}.',
    hint: 'Это сеть, а не приложение. Попробуйте другую сеть (мобильные данные вместо Wi‑Fi или наоборот), выключите VPN, проверьте, что Google-сервисы не блокирует провайдер или роутер.',
  );
}

/// Шаг про каналы: беззвучный или скрытый на экране блокировки канал — частая причина «пуш пришёл, но молча».
PushCheckStep describeChannels(List<Map<String, dynamic>> channels) {
  if (channels.isEmpty) {
    return const PushCheckStep(title: 'Каналы уведомлений', ok: true, detail: 'На этой версии Android каналов нет — настройки общие.');
  }
  final problems = <String>[];
  for (final c in channels) {
    final name = str(c['name']);
    if (asInt(c['importance']) < 4) problems.add('«$name»: важность низкая — без звука и всплывающего окна');
    if (c['hasSound'] != true) problems.add('«$name»: звук выключен');
    if (c['lockscreenPublic'] != true) problems.add('«$name»: на экране блокировки содержимое скрыто');
  }
  if (problems.isEmpty) {
    return PushCheckStep(title: 'Каналы уведомлений', ok: true, detail: 'Звук и экран блокировки включены (${channels.length} кан.).');
  }
  return PushCheckStep(
    title: 'Каналы уведомлений',
    ok: false,
    detail: problems.join('; '),
    hint: 'Откройте «Настройки уведомлений» ниже → выберите канал → «Важность: срочно / всплывающее» и включите звук. Это настройка телефона, приложение само её менять не может.',
  );
}

/// Проходит всю цепочку: разрешение → Firebase → токен → сервер принял → сервер видит устройство → тест.
Future<List<PushCheckStep>> runPushCheck(PushCheckEnv env, {void Function(List<PushCheckStep> soFar)? onStep}) async {
  final steps = <PushCheckStep>[];
  void add(PushCheckStep s) {
    steps.add(s);
    onStep?.call(List.unmodifiable(steps));
  }

  final allowed = await env.notificationsAllowed();
  add(PushCheckStep(
    title: 'Разрешение на уведомления',
    ok: allowed != false,
    detail: allowed == false ? 'Выключено в настройках телефона.' : 'Включено.',
    hint: allowed == false ? 'Откройте «Уведомления» ниже и включите их для приложения.' : null,
  ));

  final appId = await env.firebaseAppId();
  add(PushCheckStep(
    title: 'Firebase запущен',
    ok: appId != null,
    detail: appId == null ? 'Firebase не инициализировался в приложении.' : 'Да ($appId).',
    hint: appId == null ? 'Нужны Google Play Services. Обновите их или проверьте, что телефон с сервисами Google.' : null,
  ));
  if (appId == null) return steps;

  try {
    add(describeGoogle(await env.googleReachable()));
  } catch (_) {
    // Не смогли проверить — идём дальше.
  }

  String token;
  try {
    token = await env.token();
    add(PushCheckStep(title: 'Токен устройства', ok: true, detail: 'Получен (${token.length} символов).'));
  } catch (e) {
    add(PushCheckStep(
      title: 'Токен устройства',
      ok: false,
      detail: 'Firebase не выдал токен: ${e.toString().replaceAll('\n', ' ')}',
      hint: explainTokenError(e.toString()),
    ));
    return steps;
  }

  try {
    add(describeChannels(await env.channels()));
  } catch (_) {
    // Каналы не прочитались — остальные шаги важнее.
  }

  final uploadError = await env.uploadToken(token);
  add(PushCheckStep(
    title: 'Сервер принял токен',
    ok: uploadError == null,
    detail: uploadError == null ? 'Токен сохранён на сервере.' : 'Не удалось: $uploadError',
    hint: uploadError == null ? null : 'Проверьте интернет и вход в аккаунт; при ответе 401 выйдите и войдите снова.',
  ));
  if (uploadError != null) return steps;

  try {
    final status = await env.serverStatus();
    final configured = status['fcmConfigured'] == true;
    final devices = asInt(status['nativeDevices']);
    add(PushCheckStep(
      title: 'Сервер готов рассылать',
      ok: configured && devices > 0,
      detail: configured ? 'Firebase на сервере подключён, устройств у вас: $devices.' : 'На сервере не подключён Firebase (нет ключа службы).',
      hint: configured ? null : 'Сообщите администратору: на сервере не настроен FCM — пока это так, пуши не придут никому.',
    ));
    if (!configured) return steps;
  } catch (e) {
    add(PushCheckStep(title: 'Сервер готов рассылать', ok: false, detail: 'Не удалось узнать: ${describeRequestError(e)}'));
    return steps;
  }

  try {
    final result = interpretTest(await env.sendTest());
    add(PushCheckStep(title: 'Тестовое уведомление', ok: result.ok, detail: result.detail, hint: result.hint));
  } catch (e) {
    add(PushCheckStep(title: 'Тестовое уведомление', ok: false, detail: 'Не отправлено: ${describeRequestError(e)}'));
  }
  return steps;
}

/// Настоящее устройство и сервер.
class DevicePushCheckEnv implements PushCheckEnv {
  const DevicePushCheckEnv();

  @override
  Future<bool?> notificationsAllowed() async {
    await PushStatus.instance.refresh();
    return PushStatus.instance.notificationsAllowed;
  }

  @override
  Future<String?> firebaseAppId() async {
    if (!await ensureFirebase()) return null;
    return Firebase.app().options.appId.split(':').last.substring(0, 8);
  }

  @override
  Future<({bool installations, bool mtalk})> googleReachable() async {
    Future<bool> https() async {
      try {
        final r = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 8), receiveTimeout: const Duration(seconds: 8), validateStatus: (_) => true)).get<Object?>('https://firebaseinstallations.googleapis.com/');
        return r.statusCode != null;
      } catch (_) {
        return false;
      }
    }

    Future<bool> tcp() async {
      for (final port in const [5228, 443]) {
        try {
          final socket = await Socket.connect('mtalk.google.com', port, timeout: const Duration(seconds: 6));
          socket.destroy();
          return true;
        } catch (_) {}
      }
      return false;
    }

    final results = await Future.wait([https(), tcp()]);
    return (installations: results[0], mtalk: results[1]);
  }

  @override
  Future<List<Map<String, dynamic>>> channels() async {
    final raw = await PushStatus.systemChannel.invokeMethod<List<Object?>>('notificationChannels');
    return [for (final item in raw ?? const <Object?>[]) asMap(item)];
  }

  @override
  // ignore: deprecated_member_use
  Future<String> token() async => await FirebaseMessaging.instance.getToken() ?? (throw StateError('токен пустой'));

  @override
  Future<String?> uploadToken(String token) => PushService.instance.uploadToken(token);

  @override
  Future<Map<String, dynamic>> serverStatus() async => asMap((await PushService.instance.session!.dio.get<Object?>('/api/notifications/status')).data);

  @override
  Future<Map<String, dynamic>> sendTest() async => asMap((await PushService.instance.session!.dio.post<Object?>('/api/notifications/test')).data);
}
