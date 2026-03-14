class AdminGlobalTheme {
  const AdminGlobalTheme({
    required this.id,
    required this.title,
    this.bibleVerse,
    this.prayerPoints,
  });

  final int id;
  final String title;
  final String? bibleVerse;
  final String? prayerPoints;
}
