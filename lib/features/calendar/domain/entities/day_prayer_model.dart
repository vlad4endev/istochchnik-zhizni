/// Член церкви с нуждами (молитвенные просьбы)
class ChurchMember {
  const ChurchMember({
    required this.id,
    required this.name,
    this.prayerRequest,
  });

  final int id;
  final String name;
  final String? prayerRequest;
}

/// Глобальная тема со стихами
class GlobalTheme {
  const GlobalTheme({
    required this.id,
    required this.title,
    this.bibleVerse,
    this.prayerPoints,
  });

  final int id;
  final String title;
  final String? bibleVerse;
  final String? prayerPoints;
}

/// Служение
class Ministry {
  const Ministry({
    required this.id,
    required this.title,
    this.prayerPoints,
  });

  final int id;
  final String title;
  final String? prayerPoints;
}

/// Отпавший
class Backslider {
  const Backslider({
    required this.id,
    required this.name,
  });

  final int id;
  final String name;
}

/// Модель молитвенных данных на день
class DayPrayerModel {
  const DayPrayerModel({
    required this.date,
    required this.diffDays,
    required this.members,
    required this.globalThemes,
    required this.ministries,
    required this.backsliders,
  });

  final String date;
  final int diffDays;
  final List<ChurchMember> members;
  final List<GlobalTheme> globalThemes;
  final List<Ministry> ministries;
  final List<Backslider> backsliders;
}
