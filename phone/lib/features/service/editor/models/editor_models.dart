import '../../../../core/dates.dart';
import '../../../../core/json.dart';

/// Тип блока программы (молитва, песня, проповедь…).
class BlockType {
  const BlockType({required this.id, required this.code, required this.name, required this.kind});

  final int id;
  final String code;
  final String name;

  /// song | text | speaker | custom
  final String kind;

  bool get isSong => code == 'song' || kind == 'song';
  bool get isSermon => code == 'sermon' || name.toLowerCase().contains('проповед');
  bool get isBirthdays => code.toLowerCase() == 'birthdays';
  bool get isPoem => code == 'poem' || name.toLowerCase().contains('стих');

  static BlockType? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    if (id <= 0) return null;
    return BlockType(id: id, code: str(json['code']), name: str(json['name']), kind: str(json['kind']).isEmpty ? 'custom' : str(json['kind']));
  }
}

/// Человек из справочника планировщика.
class Member {
  const Member({required this.id, required this.name, this.ministryRole = '', this.ministryDirection = '', this.appRole = '', this.appRoles = const []});

  final int id;
  final String name;
  final String ministryRole;
  final String ministryDirection;
  final String appRole;
  final List<String> appRoles;

  static Member? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    if (id <= 0) return null;
    final full = '${str(json['first_name'])} ${str(json['last_name'])}'.trim();
    final name = full.isNotEmpty ? full : str(json['name']).trim();
    return Member(
      id: id,
      name: name.isEmpty ? 'Участник #$id' : name,
      ministryRole: str(json['ministry_role']),
      ministryDirection: str(json['ministry_direction']),
      appRole: str(json['app_role']),
      appRoles: [for (final r in asList(json['app_roles'])) str(r)],
    );
  }
}

/// Шаблон программы для создания новой.
class PlanTemplate {
  const PlanTemplate({required this.id, required this.name, this.description = '', this.startTime = '10:00'});

  final int id;
  final String name;
  final String description;
  final String startTime;

  static PlanTemplate? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    if (id <= 0 || json['is_active'] == false) return null;
    return PlanTemplate(
      id: id,
      name: str(json['name']).trim().isEmpty ? 'Шаблон #$id' : str(json['name']).trim(),
      description: str(json['description']).trim(),
      startTime: shortTime(json['default_start_time']).isEmpty ? '10:00' : shortTime(json['default_start_time']),
    );
  }
}

/// Блок программы в редакторе.
class EditorBlock {
  const EditorBlock({
    required this.id,
    required this.typeId,
    required this.title,
    required this.order,
    required this.minutes,
    this.assignedId,
    this.songId,
    this.content = const {},
  });

  final int id;
  final int typeId;
  final String title;
  final int order;
  final int minutes;
  final int? assignedId;
  final int? songId;
  final Map<String, dynamic> content;

  bool get isSeparator => content['is_separator'] == true;
  bool get isHidden => content['hide_in_public'] == true;

  String get separatorLabel {
    final text = str(content['separator_text']).trim();
    if (text.isNotEmpty) return text;
    return title.trim().isEmpty ? 'Раздел' : title.trim();
  }

  EditorBlock copyWith({
    int? typeId,
    String? title,
    int? order,
    int? minutes,
    Object? assignedId = _keep,
    Object? songId = _keep,
    Map<String, dynamic>? content,
  }) =>
      EditorBlock(
        id: id,
        typeId: typeId ?? this.typeId,
        title: title ?? this.title,
        order: order ?? this.order,
        minutes: minutes ?? this.minutes,
        assignedId: identical(assignedId, _keep) ? this.assignedId : assignedId as int?,
        songId: identical(songId, _keep) ? this.songId : songId as int?,
        content: content ?? this.content,
      );

  static const Object _keep = Object();

  static int? _id(Object? raw) {
    final n = asInt(raw);
    return n > 0 ? n : null;
  }

  static EditorBlock? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    if (id <= 0) return null;
    return EditorBlock(
      id: id,
      typeId: asInt(json['block_type_id']),
      title: str(json['title']),
      order: asInt(json['order_index']),
      minutes: asInt(json['duration_minutes']),
      assignedId: _id(json['assigned_member_id']),
      songId: _id(json['song_id']),
      content: Map<String, dynamic>.from(asMap(json['content_json'])),
    );
  }

  /// Тело PATCH /api/service-blocks/:id.
  Map<String, dynamic> toPatch() => {
        'title': title,
        'block_type_id': typeId,
        'duration_minutes': minutes,
        'assigned_member_id': assignedId,
        'song_id': songId,
        'content_json': content,
      };
}

/// Программа служения в редакторе.
class PlanDraft {
  const PlanDraft({
    required this.id,
    required this.date,
    required this.startTime,
    required this.published,
    required this.archived,
    required this.blocks,
    this.templateName = '',
    this.leaderId,
    this.preacherId,
    this.musicId,
    this.poemId,
    this.currentBlockId,
    this.notes = '',
    this.shareToken = '',
    this.notifySentAt,
    this.lastEditedBy = '',
  });

  final int id;
  final DateTime date;
  final String startTime;
  final bool published;
  final bool archived;
  final List<EditorBlock> blocks;
  final String templateName;
  final int? leaderId;
  final int? preacherId;
  final int? musicId;
  final int? poemId;
  final int? currentBlockId;
  final String notes;
  final String shareToken;
  final DateTime? notifySentAt;
  final String lastEditedBy;

  PlanDraft copyWith({
    DateTime? date,
    String? startTime,
    bool? published,
    bool? archived,
    List<EditorBlock>? blocks,
    Object? leaderId = _keep,
    Object? preacherId = _keep,
    Object? musicId = _keep,
    Object? poemId = _keep,
    DateTime? notifySentAt,
  }) =>
      PlanDraft(
        id: id,
        date: date ?? this.date,
        startTime: startTime ?? this.startTime,
        published: published ?? this.published,
        archived: archived ?? this.archived,
        blocks: blocks ?? this.blocks,
        templateName: templateName,
        leaderId: identical(leaderId, _keep) ? this.leaderId : leaderId as int?,
        preacherId: identical(preacherId, _keep) ? this.preacherId : preacherId as int?,
        musicId: identical(musicId, _keep) ? this.musicId : musicId as int?,
        poemId: identical(poemId, _keep) ? this.poemId : poemId as int?,
        currentBlockId: currentBlockId,
        notes: notes,
        shareToken: shareToken,
        notifySentAt: notifySentAt ?? this.notifySentAt,
        lastEditedBy: lastEditedBy,
      );

  static const Object _keep = Object();

  static int? _id(Object? raw) {
    final n = asInt(raw);
    return n > 0 ? n : null;
  }

  static PlanDraft? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    final date = parseApiDate(json['service_date']);
    if (id <= 0 || date == null) return null;
    final blocks = [
      for (final raw in asList(json['blocks']))
        ?EditorBlock.fromJson(asMap(raw)),
    ]..sort((a, b) => a.order.compareTo(b.order));
    return PlanDraft(
      id: id,
      date: DateTime(date.year, date.month, date.day),
      startTime: shortTime(json['start_time']).isEmpty ? '10:00' : shortTime(json['start_time']),
      published: str(json['status']) == 'published',
      archived: json['is_archived'] == true,
      blocks: blocks,
      templateName: str(json['template_name']).trim(),
      leaderId: _id(json['leader_member_id']),
      preacherId: _id(json['preacher_member_id']),
      musicId: _id(json['music_ministry_member_id']),
      poemId: _id(json['poem_ministry_member_id']),
      currentBlockId: _id(json['current_block_id']),
      notes: str(json['notes']),
      shareToken: str(json['share_token']).trim(),
      notifySentAt: parseApiDate(json['published_notify_sent_at']),
      lastEditedBy: str(json['last_edited_by_name']).trim(),
    );
  }
}
