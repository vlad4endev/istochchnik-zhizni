import 'package:permission_handler/permission_handler.dart';

/// Состояние разрешения на микрофон или камеру.
enum Access { granted, denied, blocked }

Access accessOf(PermissionStatus status) {
  if (status.isGranted || status.isLimited) return Access.granted;
  if (status.isPermanentlyDenied || status.isRestricted) return Access.blocked;
  return Access.denied;
}

/// Что делать со звонком при таких разрешениях.
class CallAccessDecision {
  const CallAccessDecision({required this.canJoin, required this.useCamera, this.error, this.notice, this.offerSettings = false});

  final bool canJoin;
  final bool useCamera;

  /// Почему войти нельзя.
  final String? error;

  /// Войти можно, но без видео — сообщение пользователю.
  final String? notice;

  /// Показать «Открыть настройки»: система больше не спросит сама.
  final bool offerSettings;
}

/// Микрофон обязателен: без него разговор не имеет смысла. Камера — нет: без неё входим как в аудиозвонок.
CallAccessDecision decideCallAccess({required Access mic, required Access cam, required bool wantCamera}) {
  if (mic != Access.granted) {
    final blocked = mic == Access.blocked;
    return CallAccessDecision(
      canJoin: false,
      useCamera: false,
      error: blocked ? 'Микрофон запрещён для приложения. Разрешите его в настройках телефона — иначе вас не будет слышно.' : 'Нужен доступ к микрофону, чтобы вас было слышно. Нажмите «Повторить» и разрешите.',
      offerSettings: blocked,
    );
  }
  if (wantCamera && cam != Access.granted) {
    return CallAccessDecision(
      canJoin: true,
      useCamera: false,
      notice: cam == Access.blocked ? 'Камера запрещена для приложения — вы без видео. Разрешить можно в настройках телефона.' : 'Нет доступа к камере — вы без видео.',
    );
  }
  return CallAccessDecision(canJoin: true, useCamera: wantCamera);
}

/// Запрос разрешений у системы; подменяется в тестах.
abstract class CallPermissionGate {
  Future<({Access mic, Access cam})> request({required bool camera});
  Future<void> openSettings();
}

class DeviceCallPermissionGate implements CallPermissionGate {
  const DeviceCallPermissionGate();

  @override
  Future<({Access mic, Access cam})> request({required bool camera}) async {
    final mic = accessOf(await Permission.microphone.request());
    final cam = camera ? accessOf(await Permission.camera.request()) : Access.granted;
    return (mic: mic, cam: cam);
  }

  @override
  Future<void> openSettings() async {
    await openAppSettings();
  }
}
