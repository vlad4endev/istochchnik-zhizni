import 'package:flutter/painting.dart';

import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../../schedule/models/schedule_models.dart' show AssignmentStatus;

/// Где сейчас ближайшее служение относительно «сейчас».
enum ServicePhase { upcoming, live, feedback, closed }

/// Проповедник или ведущий на карточке «Богослужение».
class ServicePerson {
  const ServicePerson({required this.id, required this.name, this.avatarUrl});

  final int id;
  final String name;
  final String? avatarUrl;

  /// «МС» — первые буквы двух слов имени.
  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
    final letters = parts.map((p) => String.fromCharCode(p.runes.first).toUpperCase()).join();
    return letters.isEmpty ? 'П' : letters;
  }
}

/// Данные карточки «Богослужение»: кто проповедует, кто ведёт, тема и стих.
class ServiceCardData {
  const ServiceCardData({
    required this.planId,
    required this.shareToken,
    required this.startsAt,
    required this.phase,
    required this.preacher,
    required this.topic,
    required this.scripture,
    this.host,
  });

  final int planId;
  final String shareToken;
  final DateTime startsAt;
  final ServicePhase phase;
  final ServicePerson preacher;
  final ServicePerson? host;
  final String topic;
  final String scripture;

  bool get canRate => phase == ServicePhase.feedback;
}

/// Мероприятие для карточки «Мероприятия».
class HomeEvent {
  const HomeEvent({
    required this.title,
    required this.description,
    required this.whenLabel,
    this.posterUrl,
    this.isPlaceholder = false,
  });

  final String title;
  final String description;
  final String whenLabel;
  final String? posterUrl;

  /// «Мероприятий пока нет» — карточка без описания.
  final bool isPlaceholder;
}

/// Активная трансляция.
class BroadcastInfo {
  const BroadcastInfo({
    required this.status,
    required this.title,
    this.startsAt,
    this.platform = '',
    this.description = '',
    this.streamUrl = '',
  });

  final String status;
  final String title;
  final DateTime? startsAt;
  final String platform;
  final String description;
  final String streamUrl;

  bool get hasStream => streamUrl.trim().isNotEmpty;

  static BroadcastInfo? tryParse(Object? raw) {
    final m = asMap(raw);
    if (m.isEmpty) return null;
    return BroadcastInfo(
      status: str(m['status']),
      title: str(m['title']).trim(),
      startsAt: parseBroadcastStartsAt(m['starts_at']),
      platform: str(m['platform']).trim().toLowerCase(),
      description: str(m['description']).trim(),
      streamUrl: str(m['stream_url']).trim(),
    );
  }
}

/// «Настенное» время начала эфира: в базе TIMESTAMP без пояса — берём как локальное.
DateTime? parseBroadcastStartsAt(Object? raw) {
  var value = str(raw).trim();
  if (value.isEmpty) return null;
  if (!value.contains('T') && RegExp(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}').hasMatch(value)) {
    value = value.replaceFirst(RegExp(r'\s+'), 'T');
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return parsed.isUtc ? parsed.toLocal() : parsed;
}

/// Последний выпуск подкаста проповедей.
class Episode {
  const Episode({required this.title, required this.audioUrl, this.imageUrl = '', this.published});

  final String title;
  final String audioUrl;
  final String imageUrl;
  final DateTime? published;

  static List<Episode> parseList(Object? raw) => [
        for (final item in asList(asMap(raw)['episodes']))
          if (str(asMap(item)['audioUrl']).trim().isNotEmpty || str(asMap(item)['title']).trim().isNotEmpty)
            Episode(
              title: str(asMap(item)['title']).trim(),
              audioUrl: str(asMap(item)['audioUrl']).trim(),
              imageUrl: str(asMap(item)['imageUrl']).trim(),
              published: parseApiDate(asMap(item)['pubDate']),
            ),
      ];
}

enum ServiceMinistry {
  music('Прославление'),
  media('Трансляция'),
  sunday('Собрание');

  const ServiceMinistry(this.label);
  final String label;
}

/// Одна позиция человека в служении («Звукорежиссёр», «Ведущий»).
class MyRole {
  const MyRole({required this.roleName, required this.color, required this.status, this.assignmentId});

  final int? assignmentId;
  final String roleName;
  final Color color;
  final AssignmentStatus status;

  bool get canAnswer => status.awaitsAnswer && assignmentId != null;
}

/// «Твоё служение на этой неделе»: одна карточка на собрание, внутри — позиции.
class MyServiceCard {
  const MyServiceCard({
    required this.key,
    required this.ministry,
    required this.date,
    required this.startTime,
    required this.eventTitle,
    required this.roles,
  });

  final String key;
  final ServiceMinistry ministry;
  final DateTime date;
  final String startTime;
  final String eventTitle;
  final List<MyRole> roles;

  List<MyRole> get pending => [for (final r in roles) if (r.canAnswer) r];

  /// Общий статус карточки: ждёт ответа > отказ > подтверждено.
  AssignmentStatus get status {
    if (roles.any((r) => r.status.awaitsAnswer)) return AssignmentStatus.pending;
    if (roles.any((r) => r.status == AssignmentStatus.declined)) return AssignmentStatus.declined;
    if (roles.isNotEmpty && roles.every((r) => r.status == AssignmentStatus.confirmed)) return AssignmentStatus.confirmed;
    return AssignmentStatus.assigned;
  }

  /// Для воскресного собрания статуса нет: человек просто назначен.
  bool get hasStatus => ministry != ServiceMinistry.sunday;
}
