import 'package:flutter/painting.dart';

import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../logic/ministry_access.dart';

enum AssignmentStatus {
  assigned('Назначено'),
  pending('Ждёт ответа'),
  confirmed('Подтверждено'),
  declined('Отказ');

  const AssignmentStatus(this.label);
  final String label;

  static AssignmentStatus parse(Object? raw) => switch (str(raw)) {
        'confirmed' => confirmed,
        'declined' => declined,
        'pending' => pending,
        _ => assigned,
      };

  /// Человек ещё не ответил.
  bool get awaitsAnswer => this == assigned || this == pending;
}

/// «#rrggbb» с сервера → цвет; при любой странности — нейтральный тёмно-красный.
Color parseHexColor(Object? raw, {Color fallback = const Color(0xFF8A2742)}) {
  final text = str(raw).trim().replaceFirst('#', '');
  if (text.length != 6) return fallback;
  final value = int.tryParse(text, radix: 16);
  return value == null ? fallback : Color(0xFF000000 | value);
}

class ScheduleRole {
  const ScheduleRole({required this.id, required this.name, required this.color, this.sortOrder = 0, this.ministryRoleFilter});

  final int id;
  final String name;
  final Color color;
  final int sortOrder;

  /// Какая служебная роль у человека подходит к этому слоту («Звукорежиссёр»).
  final String? ministryRoleFilter;

  factory ScheduleRole.fromJson(Map<String, dynamic> json) => ScheduleRole(
        id: asInt(json['id']),
        name: str(json['name']),
        color: parseHexColor(json['color']),
        sortOrder: asInt(json['sort_order']),
        ministryRoleFilter: str(json['ministry_role_filter']).trim().isEmpty ? null : str(json['ministry_role_filter']).trim(),
      );
}

class ScheduleAssignment {
  const ScheduleAssignment({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.role,
    required this.status,
    this.avatarUrl,
  });

  final int id;
  final int memberId;
  final String memberName;
  final String? avatarUrl;
  final ScheduleRole role;
  final AssignmentStatus status;

  ScheduleAssignment withStatus(AssignmentStatus next) =>
      ScheduleAssignment(id: id, memberId: memberId, memberName: memberName, avatarUrl: avatarUrl, role: role, status: next);

  factory ScheduleAssignment.fromJson(Map<String, dynamic> json) {
    final member = asMap(json['member']);
    final role = asMap(json['role']);
    return ScheduleAssignment(
      id: asInt(json['id']),
      memberId: asInt(json['member_id']) != 0 ? asInt(json['member_id']) : asInt(member['id']),
      memberName: str(member['name']),
      avatarUrl: str(member['avatar_url']).isEmpty ? null : str(member['avatar_url']),
      role: ScheduleRole.fromJson({...role, 'id': role['id'] ?? json['role_id']}),
      status: AssignmentStatus.parse(json['status']),
    );
  }
}

/// Собрание, на которое расставляют команду (план служения из планировщика).
class ScheduleEvent {
  const ScheduleEvent({
    required this.ministry,
    required this.planId,
    required this.title,
    required this.date,
    required this.startTime,
    required this.assignments,
    this.notes = '',
  });

  final Ministry ministry;
  final int planId;
  final String title;
  final DateTime date;
  final String startTime;
  final String notes;
  final List<ScheduleAssignment> assignments;

  ScheduleEvent copyWith({List<ScheduleAssignment>? assignments}) => ScheduleEvent(
        ministry: ministry,
        planId: planId,
        title: title,
        date: date,
        startTime: startTime,
        notes: notes,
        assignments: assignments ?? this.assignments,
      );

  static ScheduleEvent? fromJson(Ministry ministry, Map<String, dynamic> json) {
    final date = parseApiDate(json['event_date']);
    if (date == null) return null;
    final planId = asInt(json['event_ref_id']) != 0 ? asInt(json['event_ref_id']) : asInt(json['id']);
    final template = str(json['template_name']).trim();
    final title = str(json['title']).trim();
    return ScheduleEvent(
      ministry: ministry,
      planId: planId,
      title: title.isNotEmpty ? title : (template.isNotEmpty ? template : 'Служение'),
      date: DateTime(date.year, date.month, date.day),
      startTime: shortTime(json['start_time']),
      notes: str(json['notes']),
      assignments: [for (final raw in asList(json['assignments'])) ScheduleAssignment.fromJson(asMap(raw))],
    );
  }
}

class PersonRef {
  const PersonRef({required this.id, required this.name, this.avatarUrl, this.ministryRole = '', this.ministryDirection = ''});

  final int id;
  final String name;
  final String? avatarUrl;
  final String ministryRole;
  final String ministryDirection;

  factory PersonRef.fromJson(Map<String, dynamic> json) {
    final first = str(json['first_name']).trim();
    final last = str(json['last_name']).trim();
    final full = '$first $last'.trim();
    return PersonRef(
      id: asInt(json['id']),
      name: str(json['name']).trim().isNotEmpty ? str(json['name']).trim() : full,
      avatarUrl: str(json['avatar_url']).isEmpty ? null : str(json['avatar_url']),
      ministryRole: str(json['ministry_role']),
      ministryDirection: str(json['ministry_direction']),
    );
  }

  static PersonRef? maybe(Object? raw) {
    if (raw is! Map) return null;
    final ref = PersonRef.fromJson(asMap(raw));
    return ref.id > 0 ? ref : null;
  }
}

/// Воскресное собрание: ведущий и проповедник.
class SundayPlan {
  const SundayPlan({
    required this.id,
    required this.date,
    required this.startTime,
    required this.published,
    this.templateName = '',
    this.leader,
    this.preacher,
    this.hasProgram = false,
  });

  /// 0 — плана ещё нет, есть только дата: назначение сохраняется по дате.
  final int id;
  final DateTime date;
  final String startTime;
  final bool published;
  final String templateName;
  final PersonRef? leader;
  final PersonRef? preacher;
  final bool hasProgram;

  String get title => templateName.isEmpty ? 'Воскресное служение' : templateName;

  SundayPlan copyWith({PersonRef? leader, PersonRef? preacher, bool clearLeader = false, bool clearPreacher = false}) => SundayPlan(
        id: id,
        date: date,
        startTime: startTime,
        published: published,
        templateName: templateName,
        leader: clearLeader ? null : (leader ?? this.leader),
        preacher: clearPreacher ? null : (preacher ?? this.preacher),
        hasProgram: hasProgram,
      );

  static SundayPlan? fromJson(Map<String, dynamic> json) {
    final date = parseApiDate(json['service_date']);
    if (date == null) return null;
    return SundayPlan(
      id: asInt(json['id']),
      date: DateTime(date.year, date.month, date.day),
      startTime: shortTime(json['start_time']),
      published: str(json['status']) == 'published',
      templateName: str(json['template_name']).trim(),
      leader: PersonRef.maybe(json['leader']),
      preacher: PersonRef.maybe(json['preacher']),
      hasProgram: json['has_program'] == true,
    );
  }
}

/// Строка «моей» ленты: что мне предстоит и нужен ли ответ.
class AgendaItem {
  const AgendaItem({
    required this.ministry,
    required this.date,
    required this.startTime,
    required this.title,
    required this.roleName,
    this.roleColor,
    this.assignmentId,
    this.status,
    this.planId = 0,
  });

  final Ministry ministry;
  final DateTime date;
  final String startTime;
  final String title;
  final String roleName;
  final Color? roleColor;

  /// Только у медиа и музыки: воскресные назначения подтверждения не требуют.
  final int? assignmentId;
  final AssignmentStatus? status;
  final int planId;

  bool get canAnswer => assignmentId != null && status != null;
  bool get awaitsAnswer => canAnswer && status!.awaitsAnswer;

  AgendaItem withStatus(AssignmentStatus next) => AgendaItem(
        ministry: ministry,
        date: date,
        startTime: startTime,
        title: title,
        roleName: roleName,
        roleColor: roleColor,
        assignmentId: assignmentId,
        status: next,
        planId: planId,
      );
}
