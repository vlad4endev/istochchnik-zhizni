import 'package:dio/dio.dart';

import '../../../../core/auth/auth_token_store.dart';
import '../../domain/entities/day_prayer_model.dart';
import '../../domain/repositories/calendar_repository.dart';
import '../dto/day_prayer_dto.dart';

/// Реализация CalendarRepository с использованием Dio
class CalendarRepositoryImpl implements CalendarRepository {
  CalendarRepositoryImpl({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;
  static const String _baseUrl = 'http://localhost:3000/api/calendar';

  @override
  Future<DayPrayerModel> getPrayerDataByDate(String date) async {
    final token = AuthTokenStore.token;
    final headers = <String, String>{};
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    final response = await _dio.get<Map<String, dynamic>>(
      '$_baseUrl/$date',
      options: Options(
        validateStatus: (status) => status != null && status < 500,
        headers: headers.isEmpty ? null : headers,
      ),
    );

    if (response.statusCode != 200) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
      );
    }

    final data = response.data;
    if (data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        type: DioExceptionType.unknown,
      );
    }

    return DayPrayerDto.fromJson(data).toDomain();
  }
}
