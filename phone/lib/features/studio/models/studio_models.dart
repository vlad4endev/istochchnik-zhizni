import '../../../core/dates.dart';
import '../../../core/json.dart';

class Setlist {
  const Setlist({
    required this.id,
    required this.ownerId,
    required this.title,
    this.date,
    this.isPublic = false,
    this.shareToken = '',
    this.fromServicePlan = false,
  });

  final int id;
  final int ownerId;
  final String title;
  final DateTime? date;
  final bool isPublic;
  final String shareToken;

  /// Создан из программы служения: другие участники команды его видят, но не правят.
  final bool fromServicePlan;

  String get displayTitle => title.trim().isEmpty ? 'Сетлист' : title.trim();

  Setlist copyWith({String? title, DateTime? date, bool clearDate = false, bool? isPublic}) => Setlist(
        id: id,
        ownerId: ownerId,
        title: title ?? this.title,
        date: clearDate ? null : (date ?? this.date),
        isPublic: isPublic ?? this.isPublic,
        shareToken: shareToken,
        fromServicePlan: fromServicePlan,
      );

  static Setlist? fromJson(Map<String, dynamic> json) {
    final id = asInt(json['id']);
    if (id <= 0) return null;
    final date = parseApiDate(json['event_date']);
    return Setlist(
      id: id,
      ownerId: asInt(json['member_id']),
      title: str(json['title']),
      date: date == null ? null : DateTime(date.year, date.month, date.day),
      isPublic: json['is_public'] == true,
      shareToken: str(json['share_token']),
      fromServicePlan: asInt(json['source_service_plan_id']) > 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'member_id': ownerId,
        'title': title,
        'event_date': date == null ? null : '${date!.year.toString().padLeft(4, '0')}-${date!.month.toString().padLeft(2, '0')}-${date!.day.toString().padLeft(2, '0')}',
        'is_public': isPublic,
        'share_token': shareToken,
        'source_service_plan_id': fromServicePlan ? 1 : null,
      };
}

/// Заметки музыканта к песне в сетлисте: к строкам и к участкам текста.
class MusicianNotes {
  const MusicianNotes({this.lines = const {}, this.blocks = const []});

  final Map<int, String> lines;
  final List<({int from, int to, String text})> blocks;

  bool get isEmpty => lines.isEmpty && blocks.isEmpty;

  factory MusicianNotes.fromJson(Object? raw) {
    if (raw is! Map || raw['v'] != 1) return const MusicianNotes();
    final json = asMap(raw);
    final lines = <int, String>{};
    for (final entry in asMap(json['lineComments']).entries) {
      final index = int.tryParse(entry.key);
      final text = str(entry.value).trim();
      if (index != null && index >= 0 && text.isNotEmpty) lines[index] = text;
    }
    final blocks = [
      for (final b in asList(json['blockComments']))
        if (str(asMap(b)['text']).trim().isNotEmpty)
          (from: asInt(asMap(b)['from']), to: asInt(asMap(b)['to']), text: str(asMap(b)['text']).trim()),
    ];
    return MusicianNotes(lines: lines, blocks: blocks);
  }
}

class SetlistItem {
  const SetlistItem({
    required this.id,
    required this.position,
    required this.songId,
    required this.title,
    required this.content,
    this.key,
    this.tempo,
    this.versionId,
    this.number,
    this.notes = const MusicianNotes(),
  });

  final int id;
  final int position;
  final int songId;
  final String title;
  final String content;

  /// Тональность, в которой песню играют в этом сетлисте (с учётом моей версии).
  final String? key;
  final int? tempo;

  /// Используется моя версия песни из студии.
  final int? versionId;
  final int? number;
  final MusicianNotes notes;

  bool get hasText => content.trim().isNotEmpty;

  factory SetlistItem.fromJson(Map<String, dynamic> json) {
    final song = asMap(json['song']);
    final key = str(json['effective_key']).trim().isNotEmpty ? str(json['effective_key']).trim() : str(song['default_key']).trim();
    final content = str(json['effective_content']).isNotEmpty ? str(json['effective_content']) : str(song['content']);
    final tempo = asInt(song['tempo']);
    final version = asInt(json['studio_version_id']);
    final number = asInt(song['number']);
    return SetlistItem(
      id: asInt(json['id']),
      position: asInt(json['position']),
      songId: asInt(json['song_id']) != 0 ? asInt(json['song_id']) : asInt(song['id']),
      title: str(song['title']).trim().isEmpty ? 'Песня' : str(song['title']).trim(),
      content: content,
      key: key.isEmpty ? null : key,
      tempo: tempo > 0 ? tempo : null,
      versionId: version > 0 ? version : null,
      number: number > 0 ? number : null,
      notes: MusicianNotes.fromJson(json['musician_notes']),
    );
  }
}

/// Сетлист вместе с песнями.
class SetlistDetail {
  const SetlistDetail({required this.setlist, required this.items});
  final Setlist setlist;
  final List<SetlistItem> items;

  SetlistDetail copyWith({Setlist? setlist, List<SetlistItem>? items}) => SetlistDetail(setlist: setlist ?? this.setlist, items: items ?? this.items);
}

/// Моя версия песни из студии (свой текст и/или тональность).
class MyVersion {
  const MyVersion({required this.versionId, required this.songId, required this.title, this.key, this.updatedAt});

  final int versionId;
  final int songId;
  final String title;
  final String? key;
  final DateTime? updatedAt;

  static MyVersion? fromJson(Map<String, dynamic> json) {
    final songId = asInt(json['song_id']);
    if (songId <= 0) return null;
    final key = str(json['custom_key']).trim();
    return MyVersion(
      versionId: asInt(json['id']),
      songId: songId,
      title: str(json['song_title']).trim().isEmpty ? 'Песня' : str(json['song_title']).trim(),
      key: key.isEmpty ? null : key,
      updatedAt: DateTime.tryParse(str(json['updated_at'])),
    );
  }
}
