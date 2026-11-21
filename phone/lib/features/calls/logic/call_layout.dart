/// Раскладка встречи, как в вебе: «Сетка» и «Говорящий крупно».
enum CallLayoutMode { grid, speaker }

/// Сколько плиток помещается на телефоне; остальные сворачиваются в «+N».
const int maxGridTiles = 6;

class GridPlan {
  const GridPlan(this.columns, this.rows);
  final int columns;
  final int rows;
}

/// Сетка для [count] плиток на портретном экране: одна — на весь экран,
/// две — стопкой, три-четыре — 2×2, пять-шесть — 2×3.
GridPlan gridPlan(int count) {
  if (count <= 1) return const GridPlan(1, 1);
  if (count == 2) return const GridPlan(1, 2);
  if (count <= 4) return const GridPlan(2, 2);
  return const GridPlan(2, 3);
}

/// Делит участников на видимые и «+N»: при переполнении показываем [max]−1 плиток и счётчик.
({List<T> visible, int overflow}) splitOverflow<T>(List<T> all, {int max = maxGridTiles}) {
  if (all.length <= max) return (visible: all, overflow: 0);
  final shown = max - 1;
  return (visible: all.sublist(0, shown), overflow: all.length - shown);
}

/// Кого показывать крупно: говорящий собеседник, иначе прежний, иначе первый собеседник, иначе я.
T? pickSpotlight<T>({
  required List<T> people,
  required bool Function(T) isLocal,
  required bool Function(T) isSpeaking,
  T? previous,
}) {
  if (people.isEmpty) return null;
  final remotes = [for (final p in people) if (!isLocal(p)) p];
  for (final p in remotes) {
    if (isSpeaking(p)) return p;
  }
  if (previous != null && people.contains(previous)) return previous;
  return remotes.isNotEmpty ? remotes.first : people.first;
}

/// «05:07» или «1:02:09» — время в звонке.
String callTimer(Duration d) {
  final total = d.inSeconds < 0 ? 0 : d.inSeconds;
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  final s = total % 60;
  String two(int v) => v.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
}

/// Подпись «Участники»: «1 участник», «2 участника», «5 участников».
String participantsCaption(int n) {
  final mod100 = n % 100;
  final mod10 = n % 10;
  final word = (mod100 >= 11 && mod100 <= 14)
      ? 'участников'
      : mod10 == 1
          ? 'участник'
          : (mod10 >= 2 && mod10 <= 4)
              ? 'участника'
              : 'участников';
  return '$n $word';
}
