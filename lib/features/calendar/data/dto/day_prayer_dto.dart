import '../../domain/entities/day_prayer_model.dart';

/// DTO для парсинга JSON-ответа бэкенда
class DayPrayerDto {
  DayPrayerDto({
    required this.date,
    required this.diffDays,
    required this.members,
    required this.globalThemes,
    required this.ministries,
    required this.backsliders,
  });

  factory DayPrayerDto.fromJson(Map<String, dynamic> json) {
    return DayPrayerDto(
      date: json['date'] as String,
      diffDays: json['diffDays'] as int,
      members: (json['members'] as List<dynamic>)
          .map((e) => _MemberDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      globalThemes: (json['global_themes'] as List<dynamic>)
          .map((e) => _GlobalThemeDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      ministries: (json['ministries'] as List<dynamic>)
          .map((e) => _MinistryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      backsliders: (json['backsliders'] as List<dynamic>)
          .map((e) => _BacksliderDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final String date;
  final int diffDays;
  final List<_MemberDto> members;
  final List<_GlobalThemeDto> globalThemes;
  final List<_MinistryDto> ministries;
  final List<_BacksliderDto> backsliders;

  DayPrayerModel toDomain() {
    return DayPrayerModel(
      date: date,
      diffDays: diffDays,
      members: members.map((e) => e.toDomain()).toList(),
      globalThemes: globalThemes.map((e) => e.toDomain()).toList(),
      ministries: ministries.map((e) => e.toDomain()).toList(),
      backsliders: backsliders.map((e) => e.toDomain()).toList(),
    );
  }
}

class _MemberDto {
  _MemberDto({required this.id, required this.name, this.prayerRequest});

  factory _MemberDto.fromJson(Map<String, dynamic> json) {
    return _MemberDto(
      id: json['id'] as int,
      name: json['name'] as String,
      prayerRequest: json['prayer_request'] as String?,
    );
  }

  final int id;
  final String name;
  final String? prayerRequest;

  ChurchMember toDomain() => ChurchMember(
        id: id,
        name: name,
        prayerRequest: prayerRequest,
      );
}

class _GlobalThemeDto {
  _GlobalThemeDto({
    required this.id,
    required this.title,
    this.bibleVerse,
    this.prayerPoints,
  });

  factory _GlobalThemeDto.fromJson(Map<String, dynamic> json) {
    return _GlobalThemeDto(
      id: json['id'] as int,
      title: json['title'] as String,
      bibleVerse: json['bible_verse'] as String?,
      prayerPoints: json['prayer_points'] as String?,
    );
  }

  final int id;
  final String title;
  final String? bibleVerse;
  final String? prayerPoints;

  GlobalTheme toDomain() => GlobalTheme(
        id: id,
        title: title,
        bibleVerse: bibleVerse,
        prayerPoints: prayerPoints,
      );
}

class _MinistryDto {
  _MinistryDto({required this.id, required this.title, this.prayerPoints});

  factory _MinistryDto.fromJson(Map<String, dynamic> json) {
    return _MinistryDto(
      id: json['id'] as int,
      title: json['title'] as String,
      prayerPoints: json['prayer_points'] as String?,
    );
  }

  final int id;
  final String title;
  final String? prayerPoints;

  Ministry toDomain() => Ministry(
        id: id,
        title: title,
        prayerPoints: prayerPoints,
      );
}

class _BacksliderDto {
  _BacksliderDto({required this.id, required this.name});

  factory _BacksliderDto.fromJson(Map<String, dynamic> json) {
    return _BacksliderDto(
      id: json['id'] as int,
      name: json['name'] as String,
    );
  }

  final int id;
  final String name;

  Backslider toDomain() => Backslider(id: id, name: name);
}
