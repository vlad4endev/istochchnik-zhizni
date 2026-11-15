import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
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

class _ShellPageState extends State<ShellPage> {
  int _index = 0;
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
    final pages = <Widget>[
      if (session.canOpen('dashboard')) const HomePage(),
      const FeedPage(),
      if (session.canOpen('prayer')) const PrayerPage(),
      if (session.canOpen('messenger')) const ChatsPage(),
      const MorePage(),
    ];
    final safeIndex = _index >= pages.length ? 0 : _index;
    return Scaffold(
      body: IndexedStack(index: safeIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (index) {
          setState(() => _index = index);
          if (index == pages.length - 2) _refreshUnread();
        },
        destinations: [
          if (session.canOpen('dashboard'))
            const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Главная'),
          const NavigationDestination(icon: Icon(Icons.newspaper_outlined), selectedIcon: Icon(Icons.newspaper), label: 'Лента'),
          if (session.canOpen('prayer'))
            const NavigationDestination(icon: Icon(Icons.favorite_outline), selectedIcon: Icon(Icons.favorite), label: 'Молитва'),
          if (session.canOpen('messenger'))
            NavigationDestination(
              icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.chat_bubble_outline)),
              selectedIcon: const Icon(Icons.chat_bubble),
              label: 'Чаты',
            ),
          const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'Ещё'),
        ],
      ),
    );
  }
}
