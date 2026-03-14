import '../entities/admin_member.dart';
import '../entities/prayer_request_history_item.dart';
import '../entities/admin_direction_template.dart';
import '../entities/admin_role_template.dart';
import '../entities/upcoming_week_member_assignment.dart';
import '../entities/global_theme.dart';
import '../entities/admin_ministry.dart';
import '../entities/admin_backslider.dart';
import '../entities/next_week_global_assignment.dart';

abstract class AdminRepository {
  Future<List<AdminMember>> getMembers();

  Future<AdminMember> createMember({
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
  });

  Future<AdminMember> updateMember({
    required int id,
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
    bool? isActive,
  });

  Future<void> deleteMember(int id);

  Future<AdminMember> setMemberAppRole({
    required int id,
    required String appRole,
  });

  Future<DateTime> startPrayerCycle(DateTime startDate);

  Future<void> setOneTimeMemberDateOverride({
    required int memberId,
    required DateTime targetDate,
  });

  Future<List<AdminRoleTemplate>> getRoleTemplates();

  Future<AdminRoleTemplate> createRoleTemplate(String title);

  Future<void> deleteRoleTemplate(int id);

  Future<List<AdminDirectionTemplate>> getDirectionTemplates();

  Future<AdminDirectionTemplate> createDirectionTemplate(String title);

  Future<void> deleteDirectionTemplate(int id);

  Future<List<UpcomingWeekMemberAssignment>> getNextWeekMembers();

  Future<void> updateMemberPrayerRequest({
    required int memberId,
    required String prayerRequest,
  });

  Future<List<PrayerRequestHistoryItem>> getMemberPrayerRequestHistory({
    required int memberId,
    int limit,
  });

  Future<List<AdminGlobalTheme>> getGlobalThemes();
  Future<AdminGlobalTheme> createGlobalTheme({
    required String title,
    String? bibleVerse,
    String? prayerPoints,
  });
  Future<AdminGlobalTheme> updateGlobalTheme(int id, {
    String? title,
    String? bibleVerse,
    String? prayerPoints,
  });
  Future<void> deleteGlobalTheme(int id);

  Future<List<AdminMinistry>> getMinistries();
  Future<AdminMinistry> createMinistry({required String title, String? prayerPoints});
  Future<AdminMinistry> updateMinistry(int id, {String? title, String? prayerPoints});
  Future<void> deleteMinistry(int id);

  Future<List<AdminBackslider>> getBacksliders();
  Future<AdminBackslider> createBackslider({required String name});
  Future<AdminBackslider> updateBackslider(int id, {String? name});
  Future<void> deleteBackslider(int id);

  Future<List<NextWeekGlobalAssignment>> getNextWeekGlobalAssignments();
}
