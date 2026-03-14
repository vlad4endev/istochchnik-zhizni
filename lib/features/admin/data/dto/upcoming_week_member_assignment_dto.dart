import '../../domain/entities/upcoming_week_member_assignment.dart';

class UpcomingWeekMemberAssignmentDto {
  const UpcomingWeekMemberAssignmentDto({
    required this.date,
    required this.memberId,
    required this.memberName,
    required this.prayerRequest,
  });

  final DateTime date;
  final int? memberId;
  final String? memberName;
  final String? prayerRequest;

  factory UpcomingWeekMemberAssignmentDto.fromJson(Map<String, dynamic> json) {
    final member = json['member'] as Map<String, dynamic>?;
    return UpcomingWeekMemberAssignmentDto(
      date: DateTime.parse(json['date'] as String),
      memberId: member?['id'] as int?,
      memberName: member?['name'] as String?,
      prayerRequest: member?['prayer_request'] as String?,
    );
  }

  UpcomingWeekMemberAssignment toDomain() {
    return UpcomingWeekMemberAssignment(
      date: date,
      memberId: memberId,
      memberName: memberName,
      prayerRequest: prayerRequest,
    );
  }
}
