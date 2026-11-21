import '../../../../core/session.dart';
import '../models/editor_models.dart';

const int minBlockMinutes = 0;
const int maxBlockMinutes = 600;

String _fold(String v) => v.trim().toLowerCase().replaceAll('ё', 'е');

bool _listHas(String raw, String target) {
  final t = _fold(target);
  if (t.isEmpty) return false;
  return raw.split(RegExp(r'[;,]')).map(_fold).any((s) => s == t || s.contains(t));
}

bool isLeaderCandidate(Member m) => _listHas(m.ministryRole, 'Ведущий');
bool isPreacherCandidate(Member m) => _listHas(m.ministryRole, 'Проповедник');

/// Роль «Музыкант» или направление «Музыкальное служение».
bool isMusicCandidate(Member m) =>
    m.appRole == 'musician' || m.appRoles.any((r) => r.toLowerCase() == 'musician') || _listHas(m.ministryDirection, 'Музыкальное служение');

/// Правка настроек плана (дата, время, ответственные, публикация, удаление): админ и служитель.
bool canManagePlan(AppUser? user) {
  if (user == null) return false;
  return user.isAdmin || user.role == 'minister' || user.roles.contains('minister');
}

/// Шаблоны: те же + служители с ролью «Ведущий».
bool canManageTemplates(AppUser? user) => canManagePlan(user) || (user != null && _listHas(user.ministryRole, 'Ведущий'));

/// «Сохранить как шаблон» — только администратор.
bool canSaveAsTemplate(AppUser? user) => user != null && user.isAdmin;

/// Блок с началом по часам (без учёта разделителей: у них нет длительности).
class PlanSlot {
  const PlanSlot(this.block, this.startsAt);
  final EditorBlock block;
  final String startsAt;
}

String _hhmm(int totalMinutes) {
  final m = ((totalMinutes % 1440) + 1440) % 1440;
  return '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
}

int _parseClock(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return 10 * 60;
  return (int.tryParse(parts[0]) ?? 10) * 60 + (int.tryParse(parts[1]) ?? 0);
}

int blockMinutes(EditorBlock b) => b.isSeparator ? 0 : (b.minutes < 0 ? 0 : b.minutes);

int totalMinutes(Iterable<EditorBlock> blocks) => blocks.fold(0, (sum, b) => sum + blockMinutes(b));

List<PlanSlot> timedBlocks(PlanDraft draft) {
  var cursor = _parseClock(draft.startTime);
  final sorted = [...draft.blocks]..sort((a, b) => a.order.compareTo(b.order));
  return [
    for (final b in sorted)
      () {
        final start = _hhmm(cursor);
        cursor += blockMinutes(b);
        return PlanSlot(b, start);
      }(),
  ];
}

String endTime(PlanDraft draft) => _hhmm(_parseClock(draft.startTime) + totalMinutes(draft.blocks));

/// Перенос блока в стиле ReorderableListView (newIndex считается до удаления).
List<EditorBlock> reorderBlocks(List<EditorBlock> sortedBlocks, int oldIndex, int newIndex) {
  final list = [...sortedBlocks];
  if (oldIndex < 0 || oldIndex >= list.length) return renumber(list);
  var target = newIndex;
  if (target > oldIndex) target -= 1;
  target = target.clamp(0, list.length - 1);
  final item = list.removeAt(oldIndex);
  list.insert(target, item);
  return renumber(list);
}

List<EditorBlock> renumber(List<EditorBlock> list) => [for (var i = 0; i < list.length; i++) list[i].copyWith(order: i)];

/// Проповедь всегда за проповедником («Имя — тема»), песни — за ответственным за музыку.
/// Так же делает сайт при загрузке и сохранении.
List<EditorBlock> applyResponsibles(PlanDraft draft, Map<int, BlockType> types, Map<int, Member> members) {
  final preacherName = draft.preacherId == null ? null : members[draft.preacherId]?.name;
  return [
    for (final b in draft.blocks)
      () {
        final type = types[b.typeId];
        if (type == null) return b;
        if (type.isSermon) {
          final topic = (b.content['sermon_topic'] is String ? b.content['sermon_topic'] as String : '').trim();
          final name = preacherName ?? 'Проповедник';
          return b.copyWith(assignedId: draft.preacherId, title: topic.isEmpty ? name : '$name - $topic');
        }
        if (type.isSong) return b.copyWith(assignedId: draft.musicId ?? b.assignedId);
        return b;
      }(),
  ];
}

String songBlockTitle(String title, String? key) {
  final k = (key ?? '').trim();
  return k.isEmpty ? title : '$title [$k]';
}

/// «Название [Am]» → (название, тональность).
({String title, String? key}) splitTitleAndKey(String raw) {
  final heading = raw.trim();
  final m = RegExp(r'^(.*)\s+\[([^\]]+)\]\s*$').firstMatch(heading);
  if (m == null) return (title: heading, key: null);
  final title = m.group(1)!.trim();
  final key = m.group(2)!.trim();
  return (title: title.isEmpty ? heading : title, key: key.isEmpty ? null : key);
}

// ───── «Сцена перед блоком» ─────

const stageRemoveMicKey = 'remove_mic_stands';
const stageRemovePulpitsKey = 'remove_pulpits';
const stagePlaceKey = 'place_mic_and_pulpits';

bool _flag(Object? v) => v == true || v == 1 || v == '1' || v == 'true';

bool stageRemoveOn(Map<String, dynamic> c) => _flag(c[stageRemoveMicKey]) && _flag(c[stageRemovePulpitsKey]);
bool stagePlaceOn(Map<String, dynamic> c) => _flag(c[stagePlaceKey]);

Map<String, dynamic> setStageRemove(Map<String, dynamic> c, bool on) {
  final next = {...c};
  if (on) {
    next[stageRemoveMicKey] = true;
    next[stageRemovePulpitsKey] = true;
    next.remove(stagePlaceKey);
  } else {
    next.remove(stageRemoveMicKey);
    next.remove(stageRemovePulpitsKey);
  }
  return next;
}

Map<String, dynamic> setStagePlace(Map<String, dynamic> c, bool on) {
  final next = {...c};
  if (on) {
    next[stagePlaceKey] = true;
    next.remove(stageRemoveMicKey);
    next.remove(stageRemovePulpitsKey);
  } else {
    next.remove(stagePlaceKey);
  }
  return next;
}

// ───── Иконки-метки блока (ключи как на сайте) ─────

const List<(String key, String label)> blockMarkOptions = [
  ('prayer', 'Молитва'),
  ('song', 'Песня'),
  ('scripture', 'Писание'),
  ('sermon', 'Проповедь'),
  ('announcements', 'Объявления'),
  ('offering', 'Пожертвование'),
  ('birthdays', 'Дни рождения'),
  ('communion', 'Причастие'),
  ('schedule', 'Расписание'),
  ('poem', 'Стихи'),
  ('custom', 'Произвольный'),
  ('users', 'Участники'),
  ('clock', 'Время'),
  ('note', 'Заметка'),
  ('link', 'Ссылка'),
];

/// Ограничение длительности из поля ввода: пусто/мусор → 0, максимум — 10 часов.
int parseMinutes(String raw, {int fallback = 0}) {
  final n = int.tryParse(raw.trim());
  if (n == null) return fallback;
  return n.clamp(minBlockMinutes, maxBlockMinutes);
}

String ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
