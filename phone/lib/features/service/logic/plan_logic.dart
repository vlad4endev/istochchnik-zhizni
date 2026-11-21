import '../../../core/dates.dart';
import '../../../core/json.dart';
import '../models/plan_models.dart';

/// «11:30» → 690 минут от полуночи; не время → null.
int? parseClock(String hhmm) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(hhmm.trim());
  if (m == null) return null;
  final h = int.parse(m.group(1)!);
  final min = int.parse(m.group(2)!);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

String formatClock(int minutes) {
  final m = minutes % (24 * 60);
  return '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
}

/// Во сколько начнётся каждый блок и когда закончится программа.
class Timeline {
  Timeline._(this.starts, this.end, this.totalMinutes);

  /// Начало каждого блока; пусто, если у служения нет времени начала.
  final List<String> starts;
  final String? end;
  final int totalMinutes;

  factory Timeline.of(String startTime, List<PlanBlock> blocks) {
    final total = blocks.fold<int>(0, (sum, b) => sum + (b.durationMinutes < 0 ? 0 : b.durationMinutes));
    final start = parseClock(startTime);
    if (start == null) return Timeline._(const [], null, total);
    var cursor = start;
    final starts = <String>[];
    for (final b in blocks) {
      starts.add(formatClock(cursor));
      cursor += b.durationMinutes < 0 ? 0 : b.durationMinutes;
    }
    return Timeline._(starts, total == 0 ? null : formatClock(cursor), total);
  }
}

/// «1 ч 40 мин», «45 мин», «2 ч».
String durationText(int minutes) {
  if (minutes <= 0) return '';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m мин';
  return m == 0 ? '$h ч' : '$h ч $m мин';
}

String _stripIndex(String value) => value.replaceFirst(RegExp(r'^\s*\d+\.\s+'), '').trim();

String _norm(String s) => s.toLowerCase().replaceAll('ё', 'е').replaceAll(RegExp(r'\s+'), ' ').trim();

final _emptyLabel = RegExp(r'^(Читает|Чтец|Исполнитель|Автор|Тема стиха|Тема|Писание|Заметка)\s*:\s*$', caseSensitive: false);
final _internalKey = RegExp(r'^(schedule_week_|birthday_week_)[a-z0-9_]*$', caseSensitive: false);
const _boundaryKeys = ['schedule_week_start', 'schedule_week_end', 'birthday_week_start', 'birthday_week_end'];

/// Заметка без служебных строк планировщика и пустых меток («Читает:»).
String meaningfulNote(String raw, Map<String, dynamic> content) {
  final boundaries = {
    for (final k in _boundaryKeys)
      if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(str(content[k]).trim())) str(content[k]).trim(),
  };
  final out = <String>[];
  for (final line in raw.split(RegExp(r'\r?\n'))) {
    final t = line.trim();
    if (t.isEmpty || _internalKey.hasMatch(t) || boundaries.contains(t) || _emptyLabel.hasMatch(t)) continue;
    out.add(t);
  }
  return out.join('\n');
}

String _shortDate(String iso) {
  final d = parseApiDate(iso);
  if (d == null) return '';
  return '${weekdayName(d).substring(0, 2)}, ${d.day} ${_monthShort(d.month)}';
}

String _monthShort(int m) => const ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m - 1];

List<String> birthdayRows(Map<String, dynamic> content) => [
      for (final raw in asList(content['birthday_people']))
        if (str(asMap(raw)['name']).trim().isNotEmpty)
          () {
            final name = str(asMap(raw)['name']).trim();
            final date = _shortDate(str(asMap(raw)['week_date']).trim());
            return date.isEmpty ? name : '$name — $date';
          }(),
    ];

List<String> scheduleRows(Map<String, dynamic> content) => [
      for (final raw in asList(content['schedule_events']))
        if (str(asMap(raw)['title']).trim().isNotEmpty)
          () {
            final row = asMap(raw);
            final time = str(row['event_time']).trim();
            final prefix = [_shortDate(str(row['event_date']).trim()), time.length >= 5 ? time.substring(0, 5) : time].where((p) => p.isNotEmpty).join(' ');
            final title = str(row['title']).trim();
            return prefix.isEmpty ? title : '$prefix — $title';
          }(),
    ];

List<String> stageSetupLines(Map<String, dynamic> content) {
  bool on(Object? v) => v == true || v == 1 || v == '1' || v == 'true';
  if (on(content['place_mic_and_pulpits'])) return const ['Выставляем микрофоны и пюпитры'];
  return [
    if (on(content['remove_mic_stands'])) 'Убираем микрофонные стойки',
    if (on(content['remove_pulpits'])) 'Убираем пюпитры',
  ];
}

/// Всё, что показываем в карточке блока, уже разобранное из content_json.
class BlockDetails {
  const BlockDetails({
    required this.heading,
    this.songLine = '',
    this.subline = '',
    this.scripture = '',
    this.note = '',
    this.list = const [],
    this.stage = const [],
    this.speaker = '',
  });

  final String heading;

  /// «Название [G]» — если не совпадает с заголовком.
  final String songLine;
  final String subline;

  /// Место Писания проповеди: по нему открывается Библия.
  final String scripture;
  final String note;
  final List<String> list;
  final List<String> stage;

  /// Кто ведёт блок, если это не видно из заголовка.
  final String speaker;

  bool get isEmpty => songLine.isEmpty && subline.isEmpty && scripture.isEmpty && note.isEmpty && list.isEmpty && stage.isEmpty && speaker.isEmpty;
}

BlockDetails detailsOf(PlanBlock b) {
  final c = b.content;
  final notesRaw = str(c['notes']).trim();
  final textRaw = str(c['text']).trim();
  var note = meaningfulNote(notesRaw.isNotEmpty ? notesRaw : textRaw, c);
  final title = _stripIndex(b.title);
  final songLine = b.songTitle.isEmpty ? '' : (b.songKey.isEmpty ? b.songTitle : '${b.songTitle} [${b.songKey}]');
  // Заметка, повторяющая название песни, только шумит.
  final dupes = {_norm(b.songTitle), _norm(songLine), _norm(title)}..remove('');
  if (note.isNotEmpty && dupes.contains(_norm(note))) note = '';

  switch (b.kind) {
    case BlockKind.poem:
      final author = str(c['poem_author']).trim();
      final theme = str(c['poem_theme']).trim();
      return BlockDetails(
        heading: b.assignedName.isEmpty ? 'Стих' : 'Стих — ${b.assignedName}',
        subline: author.isNotEmpty && theme.isNotEmpty ? '$author • $theme' : (author.isNotEmpty ? author : theme),
        note: note,
        stage: stageSetupLines(c),
      );
    case BlockKind.sermon:
      final topic = str(c['sermon_topic']).trim();
      final preacher = b.assignedName.isEmpty ? 'Проповедь' : b.assignedName;
      return BlockDetails(
        heading: topic.isEmpty ? preacher : '$preacher — $topic',
        scripture: str(c['sermon_scripture']).trim(),
        note: note,
        stage: stageSetupLines(c),
      );
    case BlockKind.birthdays:
      return BlockDetails(heading: 'Дни рождения недели', list: birthdayRows(c), note: note);
    case BlockKind.schedule:
      return BlockDetails(heading: title.isEmpty ? 'Расписание на неделю' : title, list: scheduleRows(c), note: note);
    case BlockKind.song:
    case BlockKind.other:
      final heading = title.isNotEmpty ? title : (b.typeName.isNotEmpty ? b.typeName : (songLine.isNotEmpty ? b.songTitle : 'Блок'));
      final stripped = songLine.replaceAll(RegExp(r'\s*\[[^\]]*\]$'), '');
      final showSong = songLine.isNotEmpty && _norm(stripped) != _norm(heading.replaceAll(RegExp(r'\s*\[[^\]]*\]$'), ''));
      return BlockDetails(
        heading: heading,
        songLine: showSong ? songLine : '',
        note: note,
        list: scheduleRows(c),
        stage: stageSetupLines(c),
        speaker: b.assignedName,
      );
  }
}

/// Программа текстом — отправить в мессенджер. Время блоков — если известно начало.
String programText(PlanView plan) {
  final s = plan.summary;
  final timeline = Timeline.of(s.startTime, plan.blocks);
  final buf = StringBuffer()
    ..writeln('${s.title} — ${weekdayName(s.date)}, ${longDate(s.date)}${s.startTime.isEmpty ? '' : ', ${s.startTime}'}');
  if (plan.leaderName.isNotEmpty) buf.writeln('Ведущий: ${plan.leaderName}');
  if (plan.preacherName.isNotEmpty) buf.writeln('Проповедник: ${plan.preacherName}');
  buf.writeln();
  for (var i = 0; i < plan.blocks.length; i++) {
    final b = plan.blocks[i];
    final d = detailsOf(b);
    final time = timeline.starts.isEmpty ? '' : '${timeline.starts[i]} ';
    final minutes = b.durationMinutes > 0 ? ' (${b.durationMinutes} мин)' : '';
    final extra = [if (d.songLine.isNotEmpty) d.songLine, if (d.speaker.isNotEmpty) d.speaker, if (d.scripture.isNotEmpty) d.scripture].join(', ');
    buf.writeln('$time${d.heading}${extra.isEmpty ? '' : ': $extra'}$minutes');
  }
  if (timeline.end != null) {
    buf
      ..writeln()
      ..writeln('Окончание около ${timeline.end} (${durationText(timeline.totalMinutes)})');
  }
  if (plan.notes.trim().isNotEmpty) {
    buf
      ..writeln()
      ..writeln(plan.notes.trim());
  }
  return buf.toString().trimRight();
}

/// Подставляет названия и тональность песен из песенника туда, где программа пришла без них
/// (запасной путь загрузки). Блоки, у которых название уже есть, не трогаем.
PlanView fillSongTitles(PlanView plan, Map<int, ({String title, String key})> songs) {
  var changed = false;
  final blocks = [
    for (final b in plan.blocks)
      if (b.songId != null && b.songTitle.isEmpty && songs[b.songId] != null)
        () {
          changed = true;
          final song = songs[b.songId]!;
          return b.withSong(title: song.title, key: song.key);
        }()
      else
        b,
  ];
  return changed ? plan.withBlocks(blocks) : plan;
}
