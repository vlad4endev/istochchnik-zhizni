class AdminMinistry {
  const AdminMinistry({
    required this.id,
    required this.title,
    this.prayerPoints,
  });

  final int id;
  final String title;
  final String? prayerPoints;
}
