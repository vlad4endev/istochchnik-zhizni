import '../../domain/entities/admin_member.dart';

class AdminMemberDto {
  const AdminMemberDto({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phoneNumber,
    required this.birthDate,
    required this.prayerRequest,
    required this.ministryRole,
    required this.ministryDirection,
    required this.email,
    required this.accountProvider,
    required this.accountId,
    required this.isActive,
    required this.appRole,
    required this.createdAt,
    required this.updatedAt,
  });

  final int id;
  final String firstName;
  final String lastName;
  final String? phoneNumber;
  final String? birthDate;
  final String? prayerRequest;
  final String? ministryRole;
  final String? ministryDirection;
  final String? email;
  final String? accountProvider;
  final String? accountId;
  final bool isActive;
  final String appRole;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory AdminMemberDto.fromJson(Map<String, dynamic> json) {
    final fullName = (json['name'] as String?)?.trim() ?? '';
    final resolvedFirstName = (json['first_name'] as String?)?.trim();
    final resolvedLastName = (json['last_name'] as String?)?.trim();
    final fallbackParts = fullName.isEmpty ? const <String>[] : fullName.split(RegExp(r'\s+'));

    return AdminMemberDto(
      id: json['id'] as int,
      firstName: (resolvedFirstName != null && resolvedFirstName.isNotEmpty)
          ? resolvedFirstName
          : (fallbackParts.length > 1 ? fallbackParts.sublist(1).join(' ') : (fallbackParts.isNotEmpty ? fallbackParts.first : '')),
      lastName: (resolvedLastName != null && resolvedLastName.isNotEmpty)
          ? resolvedLastName
          : (fallbackParts.isNotEmpty ? fallbackParts.first : ''),
      phoneNumber: json['phone_number'] as String?,
      birthDate: json['birth_date'] as String?,
      prayerRequest: json['prayer_request'] as String?,
      ministryRole: json['ministry_role'] as String?,
      ministryDirection: json['ministry_direction'] as String?,
      email: json['email'] as String?,
      accountProvider: json['account_provider'] as String?,
      accountId: json['account_id'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      appRole: (json['app_role'] as String?) ?? 'member',
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  AdminMember toDomain() {
    return AdminMember(
      id: id,
      firstName: firstName,
      lastName: lastName,
      phoneNumber: phoneNumber,
      birthDate: birthDate,
      prayerRequest: prayerRequest,
      ministryRole: ministryRole,
      ministryDirection: ministryDirection,
      email: email,
      accountProvider: accountProvider,
      accountId: accountId,
      isActive: isActive,
      appRole: appRole,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
