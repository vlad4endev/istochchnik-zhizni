import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/unread_badge.dart';
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

class _ShellPageState extends State<ShellPage> with WidgetsBindingObserver {
  String _current = 'home';
  StreamSubscription<Map<String, dynamic>>? _chatEvents;
  final _badge = UnreadBadge.instance;

  int get _unread => _badge.count;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _badge.addListener(_onBadge);
    final session = context.read<SessionController>();
    _chatEvents = session.realtime.chatEvents.listen((_) => _badge.refreshSoon(session));
    _refreshUnread();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _badge.removeListener(_onBadge);
    _chatEvents?.cancel();
    super.dispose();
  }

  void _onBadge() {
    if (mounted) setState(() {});
  }

  /// Вернулись в приложение: сообщения могли прийти, пока оно было свёрнуто.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshUnread();
  }

  Future<void> _refreshUnread() => _badge.refresh(context.read<SessionController>());

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
      extendBody: true,
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
