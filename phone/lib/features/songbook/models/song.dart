import '../../../core/json.dart';

/// Служебные теги, которые человеку не показываем и по которым не ищем.
bool isHiddenTag(String tag) {
  final t = tag.trim().toLowerCase();
  return t.isEmpty || t.startsWith('__') || t == 'импортированная' || t == 'импортировано' || t == 'нет_текста';
}

class Song {
  const Song({
    required this.id,
    required this.title,
    this.number,
    this.content = '',
    this.key,
    this.tempo,
    this.timeSignature,
    this.tags = const [],
    this.favorite = false,
    this.hasStudioVersion = false,
  });

  /// Песня без записи в каталоге (например, из сетлиста): без избранного и версий.
  const Song.adHoc({required this.title, required this.content, this.key})
      : id = 0,
        number = null,
        tempo = null,
        timeSignature = null,
        tags = const [],
        favorite = false,
        hasStudioVersion = false;

  final int id;
  final int? number;
  final String title;
  final String content;
  final String? key;
  final int? tempo;
  final String? timeSignature;
  final List<String> tags;
  final bool favorite;
  final bool hasStudioVersion;

  bool get inCatalog => id > 0;

  List<String> get visibleTags => [for (final t in tags) if (!isHiddenTag(t)) t.trim()];

  /// Тональность без пробелов или null, если не указана.
  String? get keyLabel {
    final k = key?.trim();
    return k == null || k.isEmpty ? null : k;
  }

  Song copyWith({bool? favorite}) => Song(
        id: id,
        number: number,
        title: title,
        content: content,
        key: key,
        tempo: tempo,
        timeSignature: timeSignature,
        tags: tags,
        favorite: favorite ?? this.favorite,
        hasStudioVersion: hasStudioVersion,
      );

  factory Song.fromJson(Map<String, dynamic> json) {
    final tempo = asInt(json['tempo']);
    final number = json['song_number'];
    return Song(
      id: asInt(json['id']),
      number: number == null ? null : asInt(number),
      title: str(json['title']).trim(),
      content: str(json['content']),
      key: json['default_key'] == null ? null : str(json['default_key']),
      tempo: tempo > 0 ? tempo : null,
      timeSignature: str(json['time_signature']).trim().isEmpty ? null : str(json['time_signature']).trim(),
      tags: [for (final t in asList(json['tags'])) str(t)],
      favorite: asBool(json['is_favorite']),
      hasStudioVersion: asBool(json['has_studio_version']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'song_number': number,
        'title': title,
        'content': content,
        'default_key': key,
        'tempo': tempo,
        'time_signature': timeSignature,
        'tags': tags,
        'is_favorite': favorite,
        'has_studio_version': hasStudioVersion,
      };
}
