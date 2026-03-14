import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/admin_repository_impl.dart';
import '../../domain/entities/admin_direction_template.dart';
import '../../domain/entities/admin_member.dart';
import '../../domain/entities/admin_role_template.dart';
import '../../domain/entities/prayer_request_history_item.dart';
import '../../domain/entities/upcoming_week_member_assignment.dart';
import '../../domain/repositories/admin_repository.dart';

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return AdminRepositoryImpl(dio: Dio());
});

final adminMembersProvider =
    AsyncNotifierProvider<AdminMembersNotifier, List<AdminMember>>(
  AdminMembersNotifier.new,
);

final adminRoleTemplatesProvider =
    AsyncNotifierProvider<AdminRoleTemplatesNotifier, List<AdminRoleTemplate>>(
  AdminRoleTemplatesNotifier.new,
);

final adminDirectionTemplatesProvider =
    AsyncNotifierProvider<AdminDirectionTemplatesNotifier, List<AdminDirectionTemplate>>(
  AdminDirectionTemplatesNotifier.new,
);

class AdminMembersNotifier extends AsyncNotifier<List<AdminMember>> {
  AdminRepository get _repository => ref.read(adminRepositoryProvider);

  @override
  Future<List<AdminMember>> build() async {
    return _repository.getMembers();
  }

  Future<void> refreshMembers() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_repository.getMembers);
  }

  Future<void> createMember({
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
  }) async {
    final previous = state.valueOrNull ?? const <AdminMember>[];
    final created = await _repository.createMember(
      firstName: firstName,
      lastName: lastName,
      phoneNumber: phoneNumber,
      birthDate: birthDate,
      ministryRole: ministryRole,
      ministryDirection: ministryDirection,
    );
    state = AsyncData([created, ...previous]);
  }

  Future<void> updateMember({
    required int id,
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
    bool? isActive,
  }) async {
    final previous = state.valueOrNull ?? const <AdminMember>[];
    final updated = await _repository.updateMember(
      id: id,
      firstName: firstName,
      lastName: lastName,
      phoneNumber: phoneNumber,
      birthDate: birthDate,
      ministryRole: ministryRole,
      ministryDirection: ministryDirection,
      isActive: isActive,
    );

    state = AsyncData(
      previous
          .map((member) => member.id == id ? updated : member)
          .toList(growable: false),
    );
  }

  Future<void> deleteMember(int id) async {
    final previous = state.valueOrNull ?? const <AdminMember>[];
    await _repository.deleteMember(id);
    state = AsyncData(
      previous.where((member) => member.id != id).toList(growable: false),
    );
  }

  Future<void> setMemberAppRole({
    required int id,
    required String appRole,
  }) async {
    final previous = state.valueOrNull ?? const <AdminMember>[];
    final updated = await _repository.setMemberAppRole(id: id, appRole: appRole);
    state = AsyncData(
      previous
          .map((member) => member.id == id ? updated : member)
          .toList(growable: false),
    );
  }

  Future<DateTime> startPrayerCycle(DateTime startDate) {
    return _repository.startPrayerCycle(startDate);
  }

  Future<void> setOneTimeMemberDateOverride({
    required int memberId,
    required DateTime targetDate,
  }) {
    return _repository.setOneTimeMemberDateOverride(
      memberId: memberId,
      targetDate: targetDate,
    );
  }

  Future<List<UpcomingWeekMemberAssignment>> getNextWeekMembers() {
    return _repository.getNextWeekMembers();
  }

  Future<void> updateMemberPrayerRequest({
    required int memberId,
    required String prayerRequest,
  }) async {
    await _repository.updateMemberPrayerRequest(
      memberId: memberId,
      prayerRequest: prayerRequest,
    );
    await refreshMembers();
  }

  Future<List<PrayerRequestHistoryItem>> getMemberPrayerRequestHistory({
    required int memberId,
    int limit = 20,
  }) {
    return _repository.getMemberPrayerRequestHistory(memberId: memberId, limit: limit);
  }
}

class AdminRoleTemplatesNotifier extends AsyncNotifier<List<AdminRoleTemplate>> {
  AdminRepository get _repository => ref.read(adminRepositoryProvider);

  @override
  Future<List<AdminRoleTemplate>> build() async {
    return _repository.getRoleTemplates();
  }

  Future<void> refreshTemplates() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_repository.getRoleTemplates);
  }

  Future<void> createTemplate(String title) async {
    final previous = state.valueOrNull ?? const <AdminRoleTemplate>[];
    final created = await _repository.createRoleTemplate(title);
    final next = [...previous, created]..sort((a, b) => a.title.compareTo(b.title));
    state = AsyncData(next);
  }

  Future<void> deleteTemplate(int id) async {
    final previous = state.valueOrNull ?? const <AdminRoleTemplate>[];
    await _repository.deleteRoleTemplate(id);
    state = AsyncData(previous.where((item) => item.id != id).toList(growable: false));
  }
}

class AdminDirectionTemplatesNotifier extends AsyncNotifier<List<AdminDirectionTemplate>> {
  AdminRepository get _repository => ref.read(adminRepositoryProvider);

  @override
  Future<List<AdminDirectionTemplate>> build() async {
    return _repository.getDirectionTemplates();
  }

  Future<void> refreshTemplates() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_repository.getDirectionTemplates);
  }

  Future<void> createTemplate(String title) async {
    final previous = state.valueOrNull ?? const <AdminDirectionTemplate>[];
    final created = await _repository.createDirectionTemplate(title);
    final next = [...previous, created]..sort((a, b) => a.title.compareTo(b.title));
    state = AsyncData(next);
  }

  Future<void> deleteTemplate(int id) async {
    final previous = state.valueOrNull ?? const <AdminDirectionTemplate>[];
    await _repository.deleteDirectionTemplate(id);
    state = AsyncData(previous.where((item) => item.id != id).toList(growable: false));
  }
}
