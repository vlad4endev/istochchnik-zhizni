import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/nav.dart';
import '../../core/push_nav.dart';
import '../../core/session.dart';
import '../../core/unread_badge.dart';
import '../../ui/kit/kit.dart';
import '../bible/audio/bible_audio_player.dart';
import '../bible/bible_store.dart' show BibleTheme;
import '../bible/widgets/audio_widgets.dart';
import '../bible/widgets/bible_palette.dart';
import '../chats/chats_page.dart';
import '../chats/data/lost_attachments.dart';
import '../chats/thread_page.dart';
import '../feed/feed_page.dart';
import '../home/home_page.dart';
import '../more/more_page.dart';
import '../prayer/prayer_page.dart';

class ShellPage extends StatefulWidget {
  const ShellPage({super.key, this.lostPicks});

  /// Откуда брать выбор файла, потерянный при выгрузке приложения (в тестах подменяется).
  final LostPickSource? lostPicks;

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
  Timer? _freshness;
  final _badge = UnreadBadge.instance;

  int get _unread => _badge.count;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _badge.addListener(_onBadge);
    PushNavigator.instance.addListener(_onPushTab);
    // Пуш, нажатый до того, как приложение построило вкладки, выполняется теперь.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      PushNavigator.instance.shellReady();
      unawaited(_restoreAfterPickerKill());
    });
    final session = context.read<SessionController>();
    _chatEvents = session.realtime.chatEvents.listen((_) => _badge.refreshSoon(session));
    _refreshUnread();
    // Пока приложение открыто, то, на что смотрят сейчас, раз в минуту сверяется с сервером:
    // новое появляется само, без перезахода в раздел.
    _freshness = Timer.periodic(const Duration(seconds: 60), (_) {
      if (_inForeground) unawaited(session.cache.revalidateRecent(within: const Duration(minutes: 5), max: 8));
    });
  }

  bool _inForeground = true;

  /// Телефон выгрузил приложение, пока было открыто окно выбора файла: возвращаем человека в тот чат и отправляем выбранное.
  Future<void> _restoreAfterPickerKill() async {
    await reopenAfterPickerKill(
      source: widget.lostPicks,
      open: (chat, files) async {
        final nav = navigatorKey.currentState;
        if (nav == null || !mounted) return;
        await nav.push(MaterialPageRoute<void>(
          builder: (_) => ThreadPage(conversationId: chat.conversationId, title: chat.title.isEmpty ? 'Чат' : chat.title, incomingAttachments: files),
        ));
      },
    );
  }

  @override
  void dispose() {
    _freshness?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _badge.removeListener(_onBadge);
    PushNavigator.instance
      ..removeListener(_onPushTab)
      ..shellGone();
    _chatEvents?.cancel();
    super.dispose();
  }

  /// Пуш просит открыть вкладку (молитва, лента, главная).
  void _onPushTab() {
    final tab = PushNavigator.instance.requestedTab;
    if (tab == null || !mounted) return;
    setState(() => _current = tab);
  }

  void _onBadge() {
    if (mounted) setState(() {});
  }

  /// Вернулись в приложение: сообщения могли прийти, пока оно было свёрнуто.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _inForeground = state == AppLifecycleState.resumed;
    if (state == AppLifecycleState.resumed) {
      _refreshUnread();
      // Пока приложение было свёрнуто, на сервере могло появиться новое — подтягиваем всё недавно открытое.
      unawaited(context.read<SessionController>().cache.revalidateRecent());
    }
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
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Озвучка Библии продолжает играть, пока человек ходит по разделам: управлять ей можно отсюда.
          ListenableBuilder(
            listenable: BiblePlayer.instance,
            builder: (context, _) => BiblePlayer.instance.isActive
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: BibleMiniPlayer(
                      player: BiblePlayer.instance,
                      palette: biblePaletteFor(BibleTheme.auto, Theme.of(context).brightness),
                      onOpen: () => showBiblePlayerSheet(context, player: BiblePlayer.instance, palette: biblePaletteFor(BibleTheme.auto, Theme.of(context).brightness)),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          ChurchBottomNav(
            items: [for (final tab in tabs) tab.item],
            index: index,
            onSelect: (next) {
              setState(() => _current = tabs[next].id);
              if (tabs[next].id == 'chats') _refreshUnread();
            },
          ),
        ],
      ),
    );
  }
}
