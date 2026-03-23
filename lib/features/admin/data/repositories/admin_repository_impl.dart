import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

import '../../../../core/auth/auth_token_store.dart';
import '../../../../core/config/app_config.dart';
import '../../domain/entities/admin_backslider.dart';
import '../../domain/entities/admin_direction_template.dart';
import '../../domain/entities/admin_member.dart';
import '../../domain/entities/admin_ministry.dart';
import '../../domain/entities/admin_role_template.dart';
import '../../domain/entities/global_theme.dart';
import '../../domain/entities/next_week_global_assignment.dart';
import '../../domain/entities/prayer_request_history_item.dart';
import '../../domain/entities/upcoming_week_member_assignment.dart';
import '../../domain/repositories/admin_repository.dart';
import '../dto/admin_member_dto.dart';
import '../dto/prayer_request_history_item_dto.dart';
import '../dto/upcoming_week_member_assignment_dto.dart';

class AdminRepositoryImpl implements AdminRepository {
  AdminRepositoryImpl({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;
  static String get _baseUrl => AppConfig.usersApiBaseUrl;
  static String get _calendarBaseUrl => AppConfig.calendarApiBaseUrl;

  Options _options({bool requireAdmin = false}) {
    final headers = <String, String>{};
    final token = AuthTokenStore.token;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (requireAdmin) {
      headers['x-role'] = 'admin';
    }

    return Options(
      validateStatus: (status) => status != null && status < 500,
      headers: headers.isEmpty ? null : headers,
    );
  }

  @override
  Future<List<AdminMember>> getMembers() async {
    final response = await _dio.get<List<dynamic>>(
      _baseUrl,
      options: _options(),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return response.data!
        .map(
          (item) =>
              AdminMemberDto.fromJson(item as Map<String, dynamic>).toDomain(),
        )
        .toList();
  }

  @override
  Future<AdminMember> createMember({
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      _baseUrl,
      data: {
        'first_name': firstName.trim(),
        'last_name': lastName.trim(),
        'phone_number': phoneNumber.trim(),
        'birth_date': birthDate.trim(),
        if (ministryRole != null) 'ministry_role': ministryRole.trim(),
        if (ministryDirection != null)
          'ministry_direction': ministryDirection.trim(),
      },
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return AdminMemberDto.fromJson(response.data!).toDomain();
  }

  @override
  Future<AdminMember> updateMember({
    required int id,
    required String firstName,
    required String lastName,
    required String phoneNumber,
    required String birthDate,
    String? ministryRole,
    String? ministryDirection,
    bool? isActive,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_baseUrl/$id',
      data: {
        'first_name': firstName.trim(),
        'last_name': lastName.trim(),
        'phone_number': phoneNumber.trim(),
        'birth_date': birthDate.trim(),
        if (ministryRole != null) 'ministry_role': ministryRole.trim(),
        if (ministryDirection != null)
          'ministry_direction': ministryDirection.trim(),
        if (isActive case final status) 'is_active': status,
      },
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return AdminMemberDto.fromJson(response.data!).toDomain();
  }

  @override
  Future<void> deleteMember(int id) async {
    final response = await _dio.delete<void>(
      '$_baseUrl/$id',
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<AdminMember> setMemberAppRole({
    required int id,
    required String appRole,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_baseUrl/$id/app-role',
      data: {'app_role': appRole.trim().toLowerCase()},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return AdminMemberDto.fromJson(response.data!).toDomain();
  }

  @override
  Future<DateTime> startPrayerCycle(DateTime startDate) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/prayer-cycle/start',
      data: {'start_date': DateFormat('yyyy-MM-dd').format(startDate)},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    final value = response.data!['start_date'];
    if (value is! String) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    final parsed = DateTime.tryParse(value);
    if (parsed == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return parsed;
  }

  @override
  Future<void> setOneTimeMemberDateOverride({
    required int memberId,
    required DateTime targetDate,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/$memberId/prayer-cycle/one-time-date',
      data: {'target_date': DateFormat('yyyy-MM-dd').format(targetDate)},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 200) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<AdminRoleTemplate>> getRoleTemplates() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/templates/ministry-roles',
      options: _options(),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return response.data!
        .map(
          (item) => AdminRoleTemplate(
            id: (item as Map<String, dynamic>)['id'] as int,
            title: item['title'] as String,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<AdminRoleTemplate> createRoleTemplate(String title) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/templates/ministry-roles',
      data: {'title': title.trim()},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return AdminRoleTemplate(
      id: response.data!['id'] as int,
      title: response.data!['title'] as String,
    );
  }

  @override
  Future<void> deleteRoleTemplate(int id) async {
    final response = await _dio.delete<void>(
      '$_baseUrl/templates/ministry-roles/$id',
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<AdminDirectionTemplate>> getDirectionTemplates() async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/templates/ministry-directions',
      options: _options(),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return response.data!
        .map(
          (item) => AdminDirectionTemplate(
            id: (item as Map<String, dynamic>)['id'] as int,
            title: item['title'] as String,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<AdminDirectionTemplate> createDirectionTemplate(String title) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_baseUrl/templates/ministry-directions',
      data: {'title': title.trim()},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return AdminDirectionTemplate(
      id: response.data!['id'] as int,
      title: response.data!['title'] as String,
    );
  }

  @override
  Future<void> deleteDirectionTemplate(int id) async {
    final response = await _dio.delete<void>(
      '$_baseUrl/templates/ministry-directions/$id',
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<UpcomingWeekMemberAssignment>> getNextWeekMembers() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_calendarBaseUrl/next-week/members',
      options: _options(),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    final days = response.data!['days'];
    if (days is! List<dynamic>) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return days
        .map(
          (item) => UpcomingWeekMemberAssignmentDto.fromJson(
            item as Map<String, dynamic>,
          ),
        )
        .map((dto) => dto.toDomain())
        .toList(growable: false);
  }

  @override
  Future<void> updateMemberPrayerRequest({
    required int memberId,
    required String prayerRequest,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_baseUrl/$memberId',
      data: {'prayer_request': prayerRequest.trim()},
      options: _options(requireAdmin: true),
    );

    if (response.statusCode != 200) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<PrayerRequestHistoryItem>> getMemberPrayerRequestHistory({
    required int memberId,
    int limit = 20,
  }) async {
    final response = await _dio.get<List<dynamic>>(
      '$_baseUrl/$memberId/prayer-requests/history',
      queryParameters: {'limit': limit},
      options: _options(),
    );

    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    return response.data!
        .map(
          (item) => PrayerRequestHistoryItemDto.fromJson(
            item as Map<String, dynamic>,
          ),
        )
        .map((dto) => dto.toDomain())
        .toList(growable: false);
  }

  @override
  Future<List<AdminGlobalTheme>> getGlobalThemes() async {
    final response = await _dio.get<List<dynamic>>(
      '$_calendarBaseUrl/global/themes',
      options: _options(),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return response.data!
        .map((item) => _GlobalThemeFromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  @override
  Future<AdminGlobalTheme> createGlobalTheme({
    required String title,
    String? bibleVerse,
    String? prayerPoints,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/themes',
      data: {
        'title': title.trim(),
        if (bibleVerse != null) 'bible_verse': bibleVerse.trim(),
        if (prayerPoints != null) 'prayer_points': prayerPoints.trim(),
      },
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _GlobalThemeFromJson(response.data!);
  }

  @override
  Future<AdminGlobalTheme> updateGlobalTheme(
    int id, {
    String? title,
    String? bibleVerse,
    String? prayerPoints,
  }) async {
    final data = <String, dynamic>{};
    if (title != null) data['title'] = title.trim();
    if (bibleVerse != null) data['bible_verse'] = bibleVerse.trim();
    if (prayerPoints != null) data['prayer_points'] = prayerPoints.trim();
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/themes/$id',
      data: data,
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _GlobalThemeFromJson(response.data!);
  }

  @override
  Future<void> deleteGlobalTheme(int id) async {
    final response = await _dio.delete<void>(
      '$_calendarBaseUrl/global/themes/$id',
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<AdminMinistry>> getMinistries() async {
    final response = await _dio.get<List<dynamic>>(
      '$_calendarBaseUrl/global/ministries',
      options: _options(),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return response.data!
        .map((item) => _MinistryFromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  @override
  Future<AdminMinistry> createMinistry({
    required String title,
    String? prayerPoints,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/ministries',
      data: {
        'title': title.trim(),
        if (prayerPoints != null) 'prayer_points': prayerPoints.trim(),
      },
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _MinistryFromJson(response.data!);
  }

  @override
  Future<AdminMinistry> updateMinistry(
    int id, {
    String? title,
    String? prayerPoints,
  }) async {
    final data = <String, dynamic>{};
    if (title != null) data['title'] = title.trim();
    if (prayerPoints != null) data['prayer_points'] = prayerPoints.trim();
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/ministries/$id',
      data: data,
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _MinistryFromJson(response.data!);
  }

  @override
  Future<void> deleteMinistry(int id) async {
    final response = await _dio.delete<void>(
      '$_calendarBaseUrl/global/ministries/$id',
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<AdminBackslider>> getBacksliders() async {
    final response = await _dio.get<List<dynamic>>(
      '$_calendarBaseUrl/global/backsliders',
      options: _options(),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return response.data!
        .map((item) => _BacksliderFromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  @override
  Future<AdminBackslider> createBackslider({required String name}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/backsliders',
      data: {'name': name.trim()},
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 201 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _BacksliderFromJson(response.data!);
  }

  @override
  Future<AdminBackslider> updateBackslider(int id, {String? name}) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '$_calendarBaseUrl/global/backsliders/$id',
      data: name != null ? {'name': name.trim()} : {},
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return _BacksliderFromJson(response.data!);
  }

  @override
  Future<void> deleteBackslider(int id) async {
    final response = await _dio.delete<void>(
      '$_calendarBaseUrl/global/backsliders/$id',
      options: _options(requireAdmin: true),
    );
    if (response.statusCode != 204) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
  }

  @override
  Future<List<NextWeekGlobalAssignment>> getNextWeekGlobalAssignments() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '$_calendarBaseUrl/next-week/global',
      options: _options(),
    );
    if (response.statusCode != 200 || response.data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    final days = response.data!['days'];
    if (days is! List<dynamic>) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }
    return days
        .map((item) => _NextWeekGlobalFromJson(item as Map<String, dynamic>))
        .toList(growable: false);
  }
}

AdminGlobalTheme _GlobalThemeFromJson(Map<String, dynamic> json) =>
    AdminGlobalTheme(
      id: json['id'] as int,
      title: json['title'] as String,
      bibleVerse: json['bible_verse'] as String?,
      prayerPoints: json['prayer_points'] as String?,
    );

AdminMinistry _MinistryFromJson(Map<String, dynamic> json) => AdminMinistry(
  id: json['id'] as int,
  title: json['title'] as String,
  prayerPoints: json['prayer_points'] as String?,
);

AdminBackslider _BacksliderFromJson(Map<String, dynamic> json) =>
    AdminBackslider(id: json['id'] as int, name: json['name'] as String);

NextWeekGlobalAssignment _NextWeekGlobalFromJson(Map<String, dynamic> json) {
  final dateStr = json['date'] as String?;
  final themesList = json['themes'] as List<dynamic>? ?? [];
  final ministriesList = json['ministries'] as List<dynamic>? ?? [];
  final backslider = json['backslider'] as Map<String, dynamic>?;
  return NextWeekGlobalAssignment(
    date: dateStr != null
        ? DateTime.tryParse(dateStr) ?? DateTime.now()
        : DateTime.now(),
    themes: themesList
        .map((e) => _GlobalThemeFromJson(e as Map<String, dynamic>))
        .toList(growable: false),
    ministries: ministriesList
        .map((e) => _MinistryFromJson(e as Map<String, dynamic>))
        .toList(growable: false),
    backslider: backslider != null ? _BacksliderFromJson(backslider) : null,
  );
}
