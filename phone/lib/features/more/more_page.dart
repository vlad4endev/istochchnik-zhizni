import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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
import '../schedule/schedule_page.dart';
import '../sermons/sermons_page.dart';
import '../service/service_page.dart';
import '../settings/settings_page.dart';
import '../songbook/songbook_page.dart';
import '../studio/studio_page.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key});

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

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    final tiles = <Widget>[
      if (session.canOpen('songbook'))
        FeatureTile(
          icon: Icons.library_music_outlined,
          label: 'Песенник',
          tone: Tone.rose,
          onTap: () => pushPage(context, const SongbookPage()),
        ),
      if (session.canOpen('service_planner'))
        FeatureTile(
          icon: Icons.event_note_outlined,
          label: 'Служение',
          tone: Tone.green,
          onTap: () => pushPage(context, const ServicePage()),
        ),
      FeatureTile(
        icon: Icons.schedule_rounded,
        label: 'Расписание',
        tone: Tone.amber,
        onTap: () => pushPage(context, const SchedulePage()),
      ),
      if (session.canOpen('studio'))
        FeatureTile(
          icon: Icons.play_circle_outline_rounded,
          label: 'Студия',
          tone: Tone.violet,
          onTap: () => pushPage(context, const StudioPage()),
        ),
      if (session.canOpen('sermons') || user?.isPreacher == true)
        FeatureTile(
          icon: Icons.mic_none_rounded,
          label: 'Проповеди',
          tone: Tone.teal,
          onTap: () => pushPage(context, const SermonsPage()),
        ),
      if (session.canOpen('bible'))
        FeatureTile(
          icon: Icons.menu_book_outlined,
          label: 'Библия',
          tone: Tone.amber,
          onTap: () => pushPage(context, const BiblePage()),
        ),
      FeatureTile(
        icon: Icons.event_outlined,
        label: 'Мероприятия',
        tone: Tone.green,
        onTap: () => pushPage(context, const EventsPage()),
      ),
      FeatureTile(
        icon: Icons.videocam_outlined,
        label: 'Трансляция',
        tone: Tone.red,
        onTap: () => pushPage(context, const BroadcastPage()),
      ),
      FeatureTile(
        icon: Icons.call_outlined,
        label: 'Звонки',
        tone: Tone.violet,
        onTap: () => pushPage(context, const CallsPage()),
      ),
    ];
    return ChurchPage(
      title: 'Ещё',
      subtitle: 'Все разделы приложения',
      body: SheetList(
        children: [
          TileGrid(children: tiles),
          if (user?.isAdmin == true) ...[
            const SectionLabel('Для администраторов'),
            ListGroup(
              children: [
                ListRow(
                  leading: const IconTile(Icons.how_to_reg_outlined, tone: Tone.wine),
                  title: 'Заявки',
                  subtitle: 'Регистрация и сброс пароля',
                  onTap: () => pushPage(context, const RequestsPage()),
                ),
                ListRow(
                  leading: const IconTile(Icons.admin_panel_settings_outlined, tone: Tone.teal),
                  title: 'Полная админка на сайте',
                  subtitle: 'Люди, роли, рассылки, база знаний',
                  trailing: Icon(Icons.open_in_new_rounded, size: 18, color: context.palette.chevron),
                  onTap: () => launchUrl(Uri.parse('${session.apiOrigin}/admin'), mode: LaunchMode.externalApplication),
                ),
              ],
            ),
          ],
          const SectionLabel('Аккаунт'),
          ListGroup(
            children: [
              ListRow(
                leading: user == null
                    ? const IconTile(Icons.person_outline_rounded, tone: Tone.amber)
                    : ChurchAvatar(
                        name: user.displayName,
                        imageUrl: user.avatarUrl == null ? null : '${session.apiOrigin}${user.avatarUrl!.startsWith('/') ? '' : '/'}${user.avatarUrl}',
                        size: 42,
                      ),
                title: 'Моя страница',
                subtitle: user == null ? 'Профиль и безопасность' : '${user.displayName} · ${roleLabel(user.role)}',
                onTap: () => pushPage(context, const ProfilePage()),
              ),
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
      ),
    );
  }
}
