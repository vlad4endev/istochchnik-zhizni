import '../../../core/session.dart';

/// Ссылка в веб-админку: `https://сайт/admin` или `…/admin?tab=roles`.
String adminUrl(String origin, [String? tab]) {
  final base = origin.endsWith('/') ? origin.substring(0, origin.length - 1) : origin;
  return tab == null ? '$base/admin' : '$base/admin?tab=$tab';
}

/// Раздел веб-админки, который удобно открыть с телефона.
class AdminLink {
  const AdminLink(this.tab, this.title, this.subtitle);

  final String tab;
  final String title;
  final String subtitle;
}

/// Вкладки совпадают с `adminTabs.tsx` на сайте.
const List<AdminLink> adminLinks = [
  AdminLink('members', 'Пользователи', 'Люди, роли, доступ, карточка участника'),
  AdminLink('sections', 'Разделы приложения', 'Кому какие разделы видны'),
  AdminLink('roles', 'Права ролей', 'Детальная настройка функций по ролям'),
  AdminLink('notifications', 'Уведомления', 'Пуши и рассылки'),
  AdminLink('telegram', 'Telegram', 'Бот и журнал авторассылки'),
  AdminLink('chats', 'Группы и каналы', 'Чаты мессенджера'),
  AdminLink('journal', 'Журнал', 'Системные логи'),
  AdminLink('diagnostics', 'Диагностика', 'Состояние проекта'),
];

/// Кто видит блок «Для администраторов» и кнопку веб-админки.
bool canSeeAdmin(AppUser? user) => user != null && user.isAdmin;

/// Пункт раздела «Ещё».
class MoreEntry {
  const MoreEntry({required this.id, required this.label, required this.group, this.keywords = const []});

  final String id;
  final String label;
  final String group;
  final List<String> keywords;
}

String _fold(String v) => v.trim().toLowerCase().replaceAll('ё', 'е');

/// Поиск по названию и ключевым словам; пусто — все.
List<MoreEntry> filterEntries(List<MoreEntry> entries, String query) {
  final q = _fold(query);
  if (q.isEmpty) return entries;
  return [
    for (final e in entries)
      if (_fold(e.label).contains(q) || e.keywords.any((k) => _fold(k).contains(q))) e,
  ];
}

/// Подпись счётчика заявок: «Ждут решения: 3» / «Новых заявок нет».
String requestsSubtitle(int? pending) {
  if (pending == null) return 'Регистрация и сброс пароля';
  if (pending == 0) return 'Новых заявок нет';
  return 'Ждут решения: $pending';
}
