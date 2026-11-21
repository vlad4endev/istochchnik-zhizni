import '../../../core/session.dart';

/// Служения, у которых есть своё расписание.
enum Ministry {
  media('Медиа', 'Медиа служение'),
  music('Музыка', 'Музыкальное служение'),
  sunday('Воскресное', 'Воскресное служение');

  const Ministry(this.shortLabel, this.label);
  final String shortLabel;
  final String label;
}

/// «ё» как «е», дефисы как пробелы, без регистра: так сопоставляет и сервер.
String normalizeMinistryToken(Object? value) => (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll(RegExp('[-–—]'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ');

List<String> splitMinistryList(Object? value) {
  final seen = <String>{};
  return [
    for (final part in (value ?? '').toString().split(RegExp('[;,]')))
      if (part.trim().isNotEmpty && seen.add(part.trim())) part.trim(),
  ];
}

bool memberHasMinistryRole(Object? ministryRole, String match) {
  final target = normalizeMinistryToken(match);
  if (target.isEmpty) return false;
  return splitMinistryList(ministryRole).map(normalizeMinistryToken).any(
        (p) => p.isNotEmpty && (p == target || p.contains(target) || target.contains(p)),
      );
}

const _musicLeaderAliases = ['Музыкальный лидер', 'Лидер Прославления', 'Лидер поклонения'];

bool _isMediaManager(Object? role) => memberHasMinistryRole(role, 'Медиа менеджер');

bool _isMusicLeader(Object? role) => _musicLeaderAliases.any((a) => memberHasMinistryRole(role, a));

bool _hasMediaDirection(Object? direction) {
  final target = normalizeMinistryToken('Медиа служение');
  return splitMinistryList(direction).map(normalizeMinistryToken).any((s) => s == target || s.contains('медиа'));
}

bool _hasMusicDirection(Object? direction) {
  final target = normalizeMinistryToken('Музыкальное служение');
  return splitMinistryList(direction).map(normalizeMinistryToken).any((s) => s == target || s.contains('музык') || target.contains(s));
}

bool _hasSundayDirection(Object? direction) => splitMinistryList(direction).map(normalizeMinistryToken).any(
      (s) => s.contains('воскресн') || s.contains('богослужен') || s.contains('ведущ'),
    );

bool _hasSundayRole(Object? role) => memberHasMinistryRole(role, 'Ведущий') || memberHasMinistryRole(role, 'Проповедник');

/// Кто что видит и кто может менять. Правила повторяют сайт и сервер; сервер всё равно проверяет сам,
/// а здесь мы лишь не показываем человеку то, что ему недоступно.
class MinistryAccess {
  const MinistryAccess({
    this.roles = const [],
    this.ministryRole = '',
    this.ministryDirection = '',
  });

  factory MinistryAccess.of(AppUser? user) => user == null
      ? const MinistryAccess()
      : MinistryAccess(roles: user.roles, ministryRole: user.ministryRole, ministryDirection: user.ministryDirection);

  final List<String> roles;
  final String ministryRole;
  final String ministryDirection;

  bool _has(String role) => roles.contains(role);

  bool get _isAdmin => _has('admin');
  bool get _isPastor => _has('pastor');
  bool get _isMusician => _has('musician');
  bool get _canModerateCatalog => _isAdmin || _isMusician || _has('editor');

  bool canView(Ministry m) => switch (m) {
        Ministry.media => _canModerateCatalog || _isMediaManager(ministryRole) || _hasMediaDirection(ministryDirection),
        Ministry.music => _isAdmin || _isMusician || _isMusicLeader(ministryRole) || _hasMusicDirection(ministryDirection),
        Ministry.sunday =>
          _isPastor || _isAdmin || _canModerateCatalog || _hasSundayDirection(ministryDirection) || _hasSundayRole(ministryRole),
      };

  bool canManage(Ministry m) => switch (m) {
        Ministry.media => _isAdmin || _isMediaManager(ministryRole),
        Ministry.music => _isAdmin || _isMusician || _isMusicLeader(ministryRole),
        Ministry.sunday => _isPastor || _isAdmin,
      };

  List<Ministry> get viewable => [for (final m in Ministry.values) if (canView(m)) m];
}
