import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/session.dart';
import '../../core/theme.dart';
import '../../ui/widgets.dart';
import '../admin/requests_page.dart';
import '../bible/bible_page.dart';
import '../broadcast/broadcast_page.dart';
import '../calls/calls_page.dart';
import '../events/events_page.dart';
import '../schedule/schedule_page.dart';
import '../sermons/sermons_page.dart';
import '../service/service_page.dart';
import '../settings/settings_page.dart';
import '../songbook/songbook_page.dart';
import '../studio/studio_page.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    final items = <_Entry>[
      if (session.canOpen('bible')) _Entry('Библия', Icons.menu_book_outlined, const BiblePage()),
      if (session.canOpen('songbook')) _Entry('Песенник', Icons.music_note_outlined, const SongbookPage()),
      if (session.canOpen('sermons')) _Entry('Проповеди', Icons.mic_none, const SermonsPage()),
      _Entry('Мероприятия', Icons.event_outlined, const EventsPage()),
      if (session.canOpen('service_planner'))
        _Entry('Служение', Icons.calendar_month_outlined, const ServicePage()),
      _Entry('Расписание', Icons.schedule, const SchedulePage()),
      if (session.canOpen('studio')) _Entry('Студия', Icons.album_outlined, const StudioPage()),
      _Entry('Трансляция', Icons.live_tv_outlined, const BroadcastPage()),
      _Entry('Звонки', Icons.call_outlined, const CallsPage()),
      if (user?.isAdmin == true) _Entry('Заявки', Icons.how_to_reg_outlined, const RequestsPage()),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Ещё')),
      body: ListView(
        children: [
          if (user != null)
            ListTile(
              leading: CircleAvatar(
                backgroundColor: churchBurgundy,
                child: Text(
                  user.displayName.isEmpty ? '?' : user.displayName.substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              title: Text(user.displayName),
              subtitle: Text(roleLabel(user.role)),
              onTap: () => pushPage(context, const SettingsPage()),
            ),
          for (final item in items)
            ListTile(
              leading: Icon(item.icon),
              title: Text(item.label),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => pushPage(context, item.page),
            ),
          if (user?.isAdmin == true)
            ListTile(
              leading: const Icon(Icons.admin_panel_settings_outlined),
              title: const Text('Полная админка на сайте'),
              subtitle: const Text('Настройки, рассылки, база знаний'),
              onTap: () => launchUrl(Uri.parse('${session.apiOrigin}/admin'), mode: LaunchMode.externalApplication),
            ),
          ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Настройки'),
            onTap: () => pushPage(context, const SettingsPage()),
          ),
        ],
      ),
    );
  }
}

class _Entry {
  const _Entry(this.label, this.icon, this.page);
  final String label;
  final IconData icon;
  final Widget page;
}
