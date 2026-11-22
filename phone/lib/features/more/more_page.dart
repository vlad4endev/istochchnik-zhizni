import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../admin/requests_page.dart';
import '../bible/bible_page.dart';
import '../broadcast/broadcast_page.dart';
import '../calls/calls_page.dart';
import '../events/events_page.dart';
import '../profile/profile_page.dart';
import '../schedule/logic/ministry_access.dart';
import '../schedule/schedule_page.dart';
import '../sermons/sermons_page.dart';
import '../service/service_page.dart';
import '../settings/settings_page.dart';
import '../songbook/songbook_page.dart';
import 'logic/more_logic.dart';
import '../studio/studio_page.dart';

class MorePage extends StatefulWidget {
  const MorePage({super.key, this.pendingRequests});

  /// Для тестов: число заявок без запроса к серверу.
  final Future<int>? pendingRequests;

  @override
  State<MorePage> createState() => _MorePageState();
}

class _MorePageState extends State<MorePage> {
  String _query = '';
  int? _pending;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    if (canSeeAdmin(session.user)) _loadPending(session);
  }

  Future<void> _loadPending(SessionController session) async {
    try {
      final n = await (widget.pendingRequests ?? ChurchApi(session).accessRequests().then((l) => l.length));
      if (mounted) setState(() => _pending = n);
    } catch (_) {
      /* подпись останется общей */
    }
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Выйти из аккаунта?'),
        content: const Text('Чтобы вернуться, понадобятся телефон и пароль.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Остаться')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: ChurchColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) await context.read<SessionController>().logout();
  }

  Future<void> _openWeb(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, 'Не удалось открыть сайт');
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    final palette = context.palette;

    // (запись для поиска, плитка)
    final items = <(MoreEntry, Widget)>[
      if (session.canOpen('service_planner'))
        (
          const MoreEntry(id: 'service', label: 'Служение', group: 'ministry', keywords: ['программа', 'шаблоны', 'план']),
          FeatureTile(icon: Icons.event_note_outlined, label: 'Служение', tone: Tone.green, onTap: () => pushPage(context, const ServicePage())),
        ),
      if (MinistryAccess.of(user).viewable.isNotEmpty)
        (
          const MoreEntry(id: 'schedule', label: 'Расписание', group: 'ministry', keywords: ['команда', 'назначения', 'медиа', 'музыка']),
          FeatureTile(icon: Icons.schedule_rounded, label: 'Расписание', tone: Tone.amber, onTap: () => pushPage(context, const SchedulePage())),
        ),
      if (session.canOpen('songbook'))
        (
          const MoreEntry(id: 'songbook', label: 'Песенник', group: 'ministry', keywords: ['песни', 'аккорды']),
          FeatureTile(icon: Icons.library_music_outlined, label: 'Песенник', tone: Tone.rose, onTap: () => pushPage(context, const SongbookPage())),
        ),
      if (session.canOpen('studio'))
        (
          const MoreEntry(id: 'studio', label: 'Студия', group: 'ministry', keywords: ['сетлисты', 'выступление', 'версии']),
          FeatureTile(icon: Icons.play_circle_outline_rounded, label: 'Студия', tone: Tone.violet, onTap: () => pushPage(context, const StudioPage())),
        ),
      if (session.canOpen('bible'))
        (
          const MoreEntry(id: 'bible', label: 'Библия', group: 'word', keywords: ['писание', 'чтение']),
          FeatureTile(icon: Icons.menu_book_outlined, label: 'Библия', tone: Tone.amber, onTap: () => pushPage(context, const BiblePage())),
        ),
      if (session.canOpen('sermons') || user?.isPreacher == true)
        (
          const MoreEntry(id: 'sermons', label: 'Проповеди', group: 'word', keywords: ['конспекты', 'заметки']),
          FeatureTile(icon: Icons.mic_none_rounded, label: 'Проповеди', tone: Tone.teal, onTap: () => pushPage(context, const SermonsPage())),
        ),
      (
        const MoreEntry(id: 'events', label: 'Мероприятия', group: 'church', keywords: ['события', 'анонсы', 'календарь']),
        FeatureTile(icon: Icons.event_outlined, label: 'Мероприятия', tone: Tone.green, onTap: () => pushPage(context, const EventsPage())),
      ),
      (
        const MoreEntry(id: 'broadcast', label: 'Трансляция', group: 'church', keywords: ['эфир', 'видео', 'онлайн']),
        FeatureTile(icon: Icons.videocam_outlined, label: 'Трансляция', tone: Tone.red, onTap: () => pushPage(context, const BroadcastPage())),
      ),
      (
        const MoreEntry(id: 'calls', label: 'Звонки', group: 'church', keywords: ['журнал звонков', 'встречи']),
        FeatureTile(icon: Icons.call_outlined, label: 'Звонки', tone: Tone.violet, onTap: () => pushPage(context, const CallsPage())),
      ),
    ];
    final visibleIds = filterEntries([for (final i in items) i.$1], _query).map((e) => e.id).toSet();
    const groups = [('ministry', 'Служение и музыка'), ('word', 'Слово'), ('church', 'Жизнь церкви')];
    final isAdmin = canSeeAdmin(user);
    final searching = _query.trim().isNotEmpty;

    return ChurchPage(
      title: 'Ещё',
      subtitle: 'Все разделы приложения',
      body: SheetList(
        children: [
          if (user != null)
            ChurchCard(
              key: const ValueKey('more-profile'),
              onTap: () => pushPage(context, const ProfilePage()),
              child: Row(
                children: [
                  ChurchAvatar(name: user.displayName, imageUrl: resolveUrl(session.apiOrigin, user.avatarUrl), size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink)),
                        const SizedBox(height: 2),
                        Text('${roleLabel(user.role)} · Мой профиль', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: palette.inkMuted)),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: palette.chevron),
                ],
              ),
            ),
          TextField(
            key: const ValueKey('more-search'),
            onChanged: (v) => setState(() => _query = v),
            textInputAction: TextInputAction.search,
            style: TextStyle(fontSize: 15.5, color: palette.ink),
            decoration: InputDecoration(
              hintText: 'Найти раздел',
              prefixIcon: Icon(Icons.search_rounded, color: palette.inkMuted),
              suffixIcon: searching ? IconButton(tooltip: 'Очистить', onPressed: () => setState(() => _query = ''), icon: const Icon(Icons.close_rounded)) : null,
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
            ),
          ),
          for (final (id, label) in groups)
            if (items.any((i) => i.$1.group == id && visibleIds.contains(i.$1.id))) ...[
              SectionLabel(label),
              TileGrid(children: [for (final i in items) if (i.$1.group == id && visibleIds.contains(i.$1.id)) i.$2]),
            ],
          if (searching && visibleIds.isEmpty) const EmptyHint('Такого раздела нет', icon: Icons.search_off_rounded, hint: 'Попробуйте другое слово'),
          if (isAdmin && !searching) ...[
            const SectionLabel('Для администраторов'),
            _AdminHero(onTap: () => _openWeb(adminUrl(session.apiOrigin))),
            ListGroup(
              children: [
                ListRow(
                  key: const ValueKey('more-requests'),
                  leading: const IconTile(Icons.how_to_reg_outlined, tone: Tone.wine),
                  title: 'Заявки',
                  subtitle: requestsSubtitle(_pending),
                  trailing: (_pending ?? 0) > 0 ? Row(mainAxisSize: MainAxisSize.min, children: [CountBadge(_pending!)]) : null,
                  onTap: () async {
                    await pushPage(context, const RequestsPage());
                    if (mounted) unawaited(_loadPending(session));
                  },
                ),
                for (final link in adminLinks)
                  ListRow(
                    key: ValueKey('admin-${link.tab}'),
                    leading: const IconTile(Icons.admin_panel_settings_outlined, tone: Tone.teal),
                    title: link.title,
                    subtitle: link.subtitle,
                    trailing: Icon(Icons.open_in_new_rounded, size: 18, color: palette.chevron),
                    onTap: () => _openWeb(adminUrl(session.apiOrigin, link.tab)),
                  ),
              ],
            ),
          ],
          if (!searching) ...[
            const SectionLabel('Аккаунт'),
            ListGroup(
              children: [
                ListRow(
                  leading: const IconTile(Icons.tune_rounded, tone: Tone.neutral),
                  title: 'Настройки',
                  subtitle: 'Тема оформления, адрес сервера',
                  onTap: () => pushPage(context, const SettingsPage()),
                ),
                ListRow(
                  leading: const IconTile(Icons.logout_rounded, tone: Tone.red),
                  title: 'Выйти из аккаунта',
                  titleColor: ChurchColors.danger,
                  chevron: false,
                  onTap: () => _confirmLogout(context),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Крупная кнопка «Админка на сайте» — главный вход для администратора.
class _AdminHero extends StatelessWidget {
  const _AdminHero({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Открыть админку на сайте',
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: const ValueKey('admin-web'),
          borderRadius: BorderRadius.circular(Radii.xl),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Radii.xl),
              gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [ChurchColors.wine, ChurchColors.wineDeep]),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(color: const Color(0x26FFFFFF), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.admin_panel_settings_rounded, color: Colors.white, size: 26),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Админка на сайте', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white)),
                        SizedBox(height: 2),
                        Text('Откроется в браузере — всё управление церковью', style: TextStyle(fontSize: 13, color: Color(0xCCFFFFFF))),
                      ],
                    ),
                  ),
                  const Icon(Icons.open_in_new_rounded, color: Colors.white, size: 22),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
