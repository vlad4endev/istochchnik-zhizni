/// Склонение по числу: 1 песня, 2 песни, 5 песен.
String pluralRu(int n, String one, String few, String many) {
  final mod100 = n.abs() % 100;
  final mod10 = n.abs() % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 == 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/// «120 песен», «1 песня».
String countSongs(int n) => '$n ${pluralRu(n, 'песня', 'песни', 'песен')}';
