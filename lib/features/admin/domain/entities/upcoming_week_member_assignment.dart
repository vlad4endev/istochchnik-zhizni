class UpcomingWeekMemberAssignment {
  const UpcomingWeekMemberAssignment({
    required this.date,
    this.memberId,
    this.memberName,
    this.prayerRequest,
  });

  final DateTime date;
  final int? memberId;
  final String? memberName;
  final String? prayerRequest;

  bool get hasMember => memberId != null && memberName != null;
}
