import '../entities/day_prayer_model.dart';

/// Репозиторий для получения молитвенных данных календаря
abstract class CalendarRepository {
  /// Получить данные молитвы на указанную дату
  /// [date] — дата в формате YYYY-MM-DD
  Future<DayPrayerModel> getPrayerDataByDate(String date);
}
