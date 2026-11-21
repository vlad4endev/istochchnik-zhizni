import 'package:flutter/painting.dart';

import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../../schedule/models/schedule_models.dart' show parseHexColor;

/// План служения в списке.
class PlanSummary {
  const PlanSummary({
    required this.id,
    required this.date,
    required this.startTime,
    required this.published,
    required this.blocksCount,
    this.templateName = '',
    this.totalMinutes = 0,
    this.leaderId,
    this.preacherId,
    this.shareToken = '',
    this.currentBlockId,
  });

  final int id;
  final DateTime date;
  final String startTime;
  final bool published;
  final int blocksCount;
  final String templateName;
  final int totalMinutes;
  final int? leaderId;
  final int? preacherId;
  final String shareToken;

  /// Блок, который сейчас идёт (отмечает ведущий).
  final int? currentBlockId;

  String get title => templateName.isEmpty ? 'Служение' : templateName;

  static int? _id(Object? raw) {
    final n = asInt(raw);
    return n > 0 ? n : null;
  }

  static PlanSummary? fromJson(Map<String, dynamic> json) {
    final date = parseApiDate(json['service_date']);
    final id = asInt(json['id']);
    if (date == null || id <= 0) return null;
    return PlanSummary(
      id: id,
      date: DateTime(date.year, date.month, date.day),
      startTime: shortTime(json['start_time']),
      published: str(json['status']) == 'published',
      blocksCount: asInt(json['blocks_count']),
      templateName: str(json['template_name']).trim(),
      totalMinutes: asInt(json['total_duration_minutes']),
      leaderId: _id(json['leader_member_id']),
      preacherId: _id(json['preacher_member_id']),
      shareToken: str(json['share_token']).trim(),
      currentBlockId: _id(json['current_block_id']),
    );
  }
}

enum BlockKind { song, sermon, poem, birthdays, schedule, other }

class PlanBlock {
  const PlanBlock({
    required this.id,
    required this.order,
    required this.title,
    required this.durationMinutes,
    required this.kind,
    this.typeName = '',
    this.assignedId,
    this.assignedName = '',
    this.songId,
    this.songTitle = '',
    this.songKey = '',
    this.content = const {},
  });

  final int id;
  final int order;
  final String title;
  final int durationMinutes;
  final BlockKind kind;
  final String typeName;
  final int? assignedId;
  final String assignedName;
  final int? songId;
  final String songTitle;
  final String songKey;
  final Map<String, dynamic> content;

  PlanBlock withSong({required String title, String key = ''}) => PlanBlock(
        id: id,
        order: order,
        title: this.title,
        durationMinutes: durationMinutes,
        kind: kind,
        typeName: typeName,
        assignedId: assignedId,
        assignedName: assignedName,
        songId: songId,
        songTitle: title,
        songKey: key,
        content: content,
      );
}

class BroadcastPerson {
  const BroadcastPerson({required this.role, required this.color, required this.name});
  final String role;
  final Color color;
  final String name;
}

class LinkedSermon {
  const LinkedSermon({required this.title, required this.topic, required this.scripture, this.author = ''});
  final String title;
  final String topic;
  final String scripture;
  final String author;
}

/// Полная программа служения с именами людей и названиями песен.
class PlanView {
  const PlanView({
    required this.summary,
    required this.blocks,
    this.notes = '',
    this.leaderName = '',
    this.preacherName = '',
    this.broadcast = const [],
    this.sermon,
    this.namesComplete = true,
  });

  final PlanSummary summary;
  final List<PlanBlock> blocks;
  final String notes;
  final String leaderName;
  final String preacherName;
  final List<BroadcastPerson> broadcast;
  final LinkedSermon? sermon;

  PlanView withBlocks(List<PlanBlock> next) => PlanView(
        summary: summary,
        blocks: next,
        notes: notes,
        leaderName: leaderName,
        preacherName: preacherName,
        broadcast: broadcast,
        sermon: sermon,
        namesComplete: namesComplete,
      );

  /// false — программа загружена запасным путём: названий песен и имён может не хватать.
  final bool namesComplete;
}

BlockKind detectBlockKind({required String code, required String typeName, int? songId, Map<String, dynamic> content = const {}}) {
  final name = typeName.toLowerCase();
  if (code == 'sermon' || name.contains('проповед')) return BlockKind.sermon;
  if (code == 'poem' || name.contains('стих')) return BlockKind.poem;
  if (code == 'birthdays' || name.contains('дни рождения')) return BlockKind.birthdays;
  if (songId != null || code == 'song' || name.contains('песн')) return BlockKind.song;
  if (asList(content['schedule_events']).isNotEmpty) return BlockKind.schedule;
  return BlockKind.other;
}

PlanBlock blockFromJson(Map<String, dynamic> json, {Map<int, String> typeNames = const {}, Map<int, String> memberNames = const {}}) {
  final code = str(json['block_type_code']).toLowerCase();
  final typeId = asInt(json['block_type_id']);
  final typeName = str(json['block_type_name']).isNotEmpty ? str(json['block_type_name']) : (typeNames[typeId] ?? '');
  final songId = asInt(json['song_id']) > 0 ? asInt(json['song_id']) : null;
  final assigned = asInt(json['assigned_member_id']) > 0 ? asInt(json['assigned_member_id']) : null;
  final content = asMap(json['content_json']);
  return PlanBlock(
    id: asInt(json['id']),
    order: asInt(json['order_index']),
    title: str(json['title']).trim(),
    durationMinutes: asInt(json['duration_minutes']),
    kind: detectBlockKind(code: code, typeName: typeName, songId: songId, content: content),
    typeName: typeName,
    assignedId: assigned,
    assignedName: str(json['assigned_member_name']).isNotEmpty ? str(json['assigned_member_name']).trim() : (memberNames[assigned] ?? ''),
    songId: songId,
    songTitle: str(json['song_title']).trim(),
    songKey: str(json['song_key']).trim(),
    content: content,
  );
}

List<BroadcastPerson> broadcastFromJson(Object? raw) => [
      for (final item in asList(raw))
        if (str(asMap(item)['member_name']).trim().isNotEmpty)
          BroadcastPerson(role: str(asMap(item)['role_name']).trim(), color: parseHexColor(asMap(item)['role_color']), name: str(asMap(item)['member_name']).trim()),
    ];

LinkedSermon? sermonFromJson(Object? raw) {
  if (raw is! Map) return null;
  final json = asMap(raw);
  final title = str(json['title']).trim();
  final topic = str(json['topic']).trim();
  final scripture = str(json['scripture']).trim();
  if (title.isEmpty && topic.isEmpty && scripture.isEmpty) return null;
  return LinkedSermon(title: title, topic: topic, scripture: scripture, author: str(json['author_name']).trim());
}
