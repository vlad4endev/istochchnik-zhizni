import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../chats/chats_page.dart';
import '../feed/feed_page.dart';
import '../home/home_page.dart';
import '../more/more_page.dart';
import '../prayer/prayer_page.dart';

class ShellPage extends StatefulWidget {
  const ShellPage({super.key});

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _Tab {
  const _Tab(this.id, this.item, this.page);
  final String id;
  final NavItem item;
  final Widget page;
}

class _ShellPageState extends State<ShellPage> {
  String _current = 'home';
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _refreshUnread();
  }

  Future<void> _refreshUnread() async {
    try {
      final count = await context.read<SessionController>().dio.get<Object?>('/api/messenger/unread-count');
      final data = count.data;
      final value = data is Map ? data['count'] : 0;
      if (!mounted) return;
      setState(() => _unread = value is num ? value.toInt() : int.tryParse('$value') ?? 0);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final tabs = <_Tab>[
      if (session.canOpen('dashboard'))
        const _Tab(
          'home',
          NavItem(label: 'Главная', icon: Icons.home_outlined, activeIcon: Icons.home_rounded),
          HomePage(),
        ),
      if (session.canOpen('prayer'))
        const _Tab(
          'prayer',
          NavItem(label: 'Молитва', icon: Icons.church_outlined, activeIcon: Icons.church_rounded),
          PrayerPage(),
        ),
      const _Tab(
        'feed',
        NavItem(label: 'Лента', icon: Icons.article_outlined, activeIcon: Icons.article_rounded),
        FeedPage(),
      ),
      if (session.canOpen('messenger'))
        _Tab(
          'chats',
          NavItem(
            label: 'Чаты',
            icon: Icons.chat_bubble_outline_rounded,
            activeIcon: Icons.chat_bubble_rounded,
            badge: _unread,
          ),
          const ChatsPage(),
        ),
      const _Tab(
        'more',
        NavItem(label: 'Ещё', icon: Icons.more_horiz_rounded, activeIcon: Icons.more_horiz_rounded),
        MorePage(),
      ),
    ];
    final found = tabs.indexWhere((tab) => tab.id == _current);
    final index = found < 0 ? 0 : found;
    return Scaffold(
      backgroundColor: ChurchColors.night,
      body: IndexedStack(index: index, children: [for (final tab in tabs) tab.page]),
      bottomNavigationBar: ChurchBottomNav(
        items: [for (final tab in tabs) tab.item],
        index: index,
        onSelect: (next) {
          setState(() => _current = tabs[next].id);
          if (tabs[next].id == 'chats') _refreshUnread();
        },
      ),
    );
  }
}
