import '../../chats/logic/attachment_logic.dart';

/// Сколько файлов можно приложить к записи (как на сервере).
const maxPostFiles = 10;

/// Потолок размера файла для ленты и историй (как на сервере).
const maxFeedFileBytes = 100 * 1024 * 1024;

/// Можно ли опубликовать запись: нужен текст или хотя бы один файл.
bool canPublishPost({required String caption, required int files}) => caption.trim().isNotEmpty || files > 0;

/// Что будет с добавляемыми файлами: сколько влезет и сколько отброшено из-за предела.
({List<T> accepted, int dropped}) clampFiles<T>(List<T> current, List<T> added, {int max = maxPostFiles}) {
  final room = (max - current.length).clamp(0, max);
  final accepted = added.take(room).toList();
  return (accepted: accepted, dropped: added.length - accepted.length);
}

/// Файл — видео (по типу содержимого или расширению).
bool isVideoFile(String name, [String? mime]) => attachmentKind(name, mime) == 'video';

/// Подпись «мегабайты» для сообщения о слишком большом файле.
String megabytes(int bytes) => '${(bytes / (1024 * 1024)).round()} МБ';

/// Размер файла в понятном виде для проверки; null — размер неизвестен.
String? tooLargeMessage(String name, int? bytes) {
  if (bytes == null || bytes <= maxFeedFileBytes) return null;
  return '«$name» весит ${megabytes(bytes)} — больше ${megabytes(maxFeedFileBytes)}. Выберите файл поменьше.';
}

/// Подпись к кнопке публикации по ходу загрузки: «Загрузка 45%».
String uploadLabel(double? fraction) => fraction == null ? 'Публикуем…' : 'Загрузка ${(fraction * 100).round()}%';
