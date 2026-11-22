import '../models/feed_models.dart';

/// Сколько показывается фото-история.
const storyImageDuration = Duration(seconds: 5);

/// Быстрые реакции на историю — те же, что в вебе.
const storyReactions = ['❤️', '😂', '😮', '😢', '😍', '🔥', '👏', '🙌'];

/// Куда нажали: левая треть экрана — назад, остальное — вперёд (как в Instagram).
enum StoryTap { previous, next }

StoryTap storyTapZone(double x, double width) => x < width / 3 ? StoryTap.previous : StoryTap.next;

/// Порядок просмотра: тап по кружку открывает эту группу, дальше идут остальные по порядку ленты.
/// Возвращает (список, индекс начальной группы).
({List<StoryGroup> groups, int start}) storyPlaylist({required StoryGroup? mine, required List<StoryGroup> others, required StoryGroup tapped}) {
  final all = [?mine, ...others];
  final start = all.indexWhere((g) => g.author.memberId == tapped.author.memberId);
  return (groups: all, start: start < 0 ? 0 : start);
}

/// Сколько осталось до исчезновения: «ещё 23 ч», «ещё 40 мин»; пусто, если срок неизвестен или вышел.
String storyTimeLeft(DateTime? expiresAt, {DateTime? now}) {
  if (expiresAt == null) return '';
  final left = expiresAt.difference(now ?? DateTime.now());
  if (left.isNegative) return '';
  if (left.inHours >= 1) return 'ещё ${left.inHours} ч';
  return 'ещё ${left.inMinutes.clamp(1, 59)} мин';
}
