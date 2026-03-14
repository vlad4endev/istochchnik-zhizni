class PrayerRequestHistoryItem {
  const PrayerRequestHistoryItem({
    required this.id,
    required this.memberId,
    required this.prayerRequest,
    required this.createdAt,
  });

  final int id;
  final int memberId;
  final String prayerRequest;
  final DateTime createdAt;
}
