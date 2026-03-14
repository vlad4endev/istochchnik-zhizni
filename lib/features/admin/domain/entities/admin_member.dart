class AdminMember {
  const AdminMember({
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

  String get fullName => '$firstName $lastName'.trim();
  bool get isAdmin => appRole.trim().toLowerCase() == 'admin';

  AdminMember copyWith({
    int? id,
    String? firstName,
    String? lastName,
    String? phoneNumber,
    String? birthDate,
    String? prayerRequest,
    String? ministryRole,
    String? ministryDirection,
    String? email,
    String? accountProvider,
    String? accountId,
    bool? isActive,
    String? appRole,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return AdminMember(
      id: id ?? this.id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      birthDate: birthDate ?? this.birthDate,
      prayerRequest: prayerRequest ?? this.prayerRequest,
      ministryRole: ministryRole ?? this.ministryRole,
      ministryDirection: ministryDirection ?? this.ministryDirection,
      email: email ?? this.email,
      accountProvider: accountProvider ?? this.accountProvider,
      accountId: accountId ?? this.accountId,
      isActive: isActive ?? this.isActive,
      appRole: appRole ?? this.appRole,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
