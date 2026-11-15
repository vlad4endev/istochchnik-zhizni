import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../ui/widgets.dart';
import '../bible/bible_page.dart';
import '../broadcast/broadcast_page.dart';
import '../calls/calls_page.dart';
import '../events/events_page.dart';
import '../prayer/prayer_page.dart';
import '../chats/chats_page.dart';
import '../sermons/sermons_page.dart';
import '../service/service_page.dart';
import '../songbook/songbook_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};
  List<dynamic> _events = const [];
  Map<String, dynamic> _podcasts = {};
  Map<String, dynamic> _broadcast = {};
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ChurchApi(context.read<SessionController>());
    final today = DateTime.now();
    final iso =
        '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    try {
      final results = await Future.wait<Object?>([
        api.day(iso),
        api.events(),
        api.podcasts(),
        api.broadcast(),
        api.unread(),
      ]);
      if (!mounted) return;
      setState(() {
        _day = results[0] as Map<String, dynamic>;
        _events = results[1] as List<dynamic>;
        _podcasts = results[2] as Map<String, dynamic>;
        _broadcast = results[3] as Map<String, dynamic>;
        _unread = results[4] as int;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user;
    final name = user?.displayName.split(' ').first ?? '';
    return Scaffold(
      appBar: AppBar(title: Text(name.isEmpty ? 'Главная' : 'Здравствуйте, $name')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                DateFormat('EEEE, d MMMM', 'ru').format(DateTime.now()),
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              if (user != null)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: churchBurgundy.withValues(alpha: 0.15),
                      child: Text(user.displayName.isEmpty ? '?' : user.displayName.substring(0, 1).toUpperCase()),
                    ),
                    title: Text(user.displayName),
                    subtitle: Text(roleLabel(user.role)),
                  ),
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Action('Молитва', Icons.favorite_outline, () => pushPage(context, const PrayerPage())),
                  _Action('Песни', Icons.music_note_outlined, () => pushPage(context, const SongbookPage())),
                  _Action('Библия', Icons.menu_book_outlined, () => pushPage(context, const BiblePage())),
                  _Action('События', Icons.event_outlined, () => pushPage(context, const EventsPage())),
                  _Action('Служение', Icons.calendar_month_outlined, () => pushPage(context, const ServicePage())),
                  _Action('Проповеди', Icons.mic_none, () => pushPage(context, const SermonsPage())),
                  _Action('Эфир', Icons.live_tv_outlined, () => pushPage(context, const BroadcastPage())),
                  _Action(
                    _unread > 0 ? 'Чаты $_unread' : 'Чаты',
                    Icons.chat_bubble_outline,
                    () => pushPage(context, const ChatsPage()),
                  ),
                  _Action('Звонки', Icons.call_outlined, () => pushPage(context, const CallsPage())),
                ],
              ),
              const SizedBox(height: 16),
              _PrayerCard(day: _day),
              const SizedBox(height: 12),
              _NextEvent(events: _events),
              const SizedBox(height: 12),
              _LiveCard(broadcast: _broadcast),
              const SizedBox(height: 12),
              _SermonCard(podcasts: _podcasts),
            ],
          ),
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      onPressed: onTap,
    );
  }
}

class _PrayerCard extends StatelessWidget {
  const _PrayerCard({required this.day});
  final Map<String, dynamic> day;

  @override
  Widget build(BuildContext context) {
    final members = asList(day['members']);
    final member = members.isEmpty ? {} : asMap(members.first);
    final themes = asList(day['global_themes']);
    final theme = themes.isEmpty ? {} : asMap(themes.first);
    final who = str(member['name']).isEmpty ? 'Не назначен' : str(member['name']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('МОЛИТВА СЕГОДНЯ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(who, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(str(member['prayer_request']).isEmpty ? 'Нужда не указана' : str(member['prayer_request'])),
            if (str(theme['title']).isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(str(theme['title']), style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ],
        ),
      ),
    );
  }
}

class _NextEvent extends StatelessWidget {
  const _NextEvent({required this.events});
  final List<dynamic> events;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic>? next;
    for (final raw in events) {
      final item = asMap(raw);
      if (asBool(item['is_active']) || str(item['is_active']).isEmpty) {
        next = item;
        break;
      }
    }
    next ??= events.isEmpty ? null : asMap(events.first);
    return Card(
      child: ListTile(
        title: const Text('Ближайшее событие'),
        subtitle: Text(next == null ? 'Событий нет' : '${str(next['title'])}\n${str(next['event_date'])} ${str(next['event_time'])}'),
        isThreeLine: next != null,
        trailing: const Icon(Icons.chevron_right),
        onTap: () => pushPage(context, const EventsPage()),
      ),
    );
  }
}

class _LiveCard extends StatelessWidget {
  const _LiveCard({required this.broadcast});
  final Map<String, dynamic> broadcast;

  @override
  Widget build(BuildContext context) {
    final item = asMap(broadcast['broadcast']);
    if (item.isEmpty) return const SizedBox.shrink();
    return Card(
      child: ListTile(
        leading: const Icon(Icons.sensors),
        title: Text(str(item['title']).isEmpty ? 'Трансляция' : str(item['title'])),
        subtitle: Text(str(item['status']) == 'live' ? 'Сейчас в эфире' : 'Запланирована'),
        onTap: () => pushPage(context, const BroadcastPage()),
      ),
    );
  }
}

class _SermonCard extends StatelessWidget {
  const _SermonCard({required this.podcasts});
  final Map<String, dynamic> podcasts;

  @override
  Widget build(BuildContext context) {
    final episodes = asList(podcasts['episodes']);
    if (episodes.isEmpty) return const SizedBox.shrink();
    final episode = asMap(episodes.first);
    return Card(
      child: ListTile(
        leading: const Icon(Icons.mic),
        title: Text(str(episode['title'])),
        subtitle: const Text('Последняя проповедь'),
        onTap: () => pushPage(context, const SermonsPage()),
      ),
    );
  }
}
