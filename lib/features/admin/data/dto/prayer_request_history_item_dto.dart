import '../../domain/entities/prayer_request_history_item.dart';

int _parseJsonInt(dynamic value, {required String field}) {
  if (value is int) {
    return value;
  }
  if (value is String) {
    final parsed = int.tryParse(value.trim());
    if (parsed != null) {
      return parsed;
    }
  }
  throw FormatException('Invalid integer for "$field": $value');
}

class PrayerRequestHistoryItemDto {
  const PrayerRequestHistoryItemDto({
    required this.id,
    required this.memberId,
    required this.prayerRequest,
    required this.createdAt,
  });

  final int id;
  final int memberId;
  final String prayerRequest;
  final DateTime createdAt;

  factory PrayerRequestHistoryItemDto.fromJson(Map<String, dynamic> json) {
    return PrayerRequestHistoryItemDto(
      id: _parseJsonInt(json['id'], field: 'id'),
      memberId: _parseJsonInt(json['member_id'], field: 'member_id'),
      prayerRequest: json['prayer_request'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  PrayerRequestHistoryItem toDomain() {
    return PrayerRequestHistoryItem(
      id: id,
      memberId: memberId,
      prayerRequest: prayerRequest,
      createdAt: createdAt,
    );
  }
}
