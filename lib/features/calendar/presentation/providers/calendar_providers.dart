import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../data/repositories/calendar_repository_impl.dart';
import '../../domain/entities/day_prayer_model.dart';
import '../../domain/repositories/calendar_repository.dart';

final calendarRepositoryProvider = Provider<CalendarRepository>((ref) {
  return CalendarRepositoryImpl(
    dio: Dio(BaseOptions(baseUrl: AppConfig.dioBaseUrl)),
  );
});

final selectedDateProvider = StateProvider<DateTime>((ref) => DateTime.now());

final prayerDataProvider =
    FutureProvider.family<DayPrayerModel, String>((ref, date) async {
  final repository = ref.watch(calendarRepositoryProvider);
  return repository.getPrayerDataByDate(date);
});
