import 'package:path/path.dart' as p;

/// Файл, выбранный человеком для отправки.
class PickedAttachment {
  const PickedAttachment({required this.path, required this.name, this.mimeType});
  final String path;
  final String name;

  /// Если плагин выбора знает тип файла; иначе определяем по расширению.
  final String? mimeType;
}

const _imageExt = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp'};
const _videoExt = {'.mp4', '.mov', '.m4v', '.3gp', '.webm', '.mkv', '.avi'};
const _audioExt = {'.m4a', '.mp3', '.aac', '.ogg', '.oga', '.opus', '.wav', '.caf'};

String _ext(String name) => p.extension(name).toLowerCase();

/// Тип по названию и (если есть) типу содержимого: «image», «video», «audio» или «file».
String attachmentKind(String name, [String? mimeType]) {
  final mime = (mimeType ?? '').split(';').first.trim().toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  final ext = _ext(name);
  if (_imageExt.contains(ext)) return 'image';
  if (_videoExt.contains(ext)) return 'video';
  if (_audioExt.contains(ext)) return 'audio';
  return 'file';
}

/// Каким типом сообщения отправлять. Как на сайте: и фото, и видео уходят как «image»
/// (по типу содержимого сервер и плееры отличают видео), звук — «audio», остальное — «file».
String payloadTypeFor(String name, [String? mimeType]) => switch (attachmentKind(name, mimeType)) {
      'image' || 'video' => 'image',
      'audio' => 'audio',
      _ => 'file',
    };

/// Видео в сообщении: по типу содержимого или расширению адреса.
bool isVideoPayload({String? mimeType, String? url, String? name}) {
  final mime = (mimeType ?? '').split(';').first.trim().toLowerCase();
  if (mime.startsWith('video/')) return true;
  if (mime.isNotEmpty && !mime.startsWith('application/')) return false;
  final source = (url ?? name ?? '').split('?').first;
  return _videoExt.contains(_ext(source));
}

/// Понятная причина сбоя отправки вложения.
String attachmentError(String name, String reason) => 'Не удалось отправить «$name»: $reason';
