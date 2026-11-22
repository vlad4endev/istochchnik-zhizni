import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'dart:async';

import '../calls/widgets/meeting_sheet.dart';
import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'data/chat_list_actions.dart';
import 'logic/chat_list_menu.dart';
import 'new_chat_page.dart';
import 'thread_page.dart';
import 'widgets/chat_list_menu.dart';

class ChatsPage extends StatefulWidget {
  const ChatsPage({super.key, this.actions, this.loadConversations});

  /// Подмена в тестах; по умолчанию — запросы к серверу.
  final ChatListActions? actions;
  final Future<List<dynamic>> Function()? loadConversations;

  @override
  State<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends State<ChatsPage> with CacheWatcher<ChatsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = const [];
  final _query = TextEditingController();
  String _filter = 'all';

  @override
  void dispose() {
    _eventDebounce?.cancel();
    _chatEvents?.cancel();
    _query.dispose();
    super.dispose();
  }

  late final ChatListActions _actions = widget.actions ?? ServerChatListActions(context.read<SessionController>());

  StreamSubscription<Map<String, dynamic>>? _chatEvents;
  Timer? _eventDebounce;

  @override
  void initState() {
    super.initState();
    _load();
    final session = context.read<SessionController>();
    // Фоном пришёл свежий список — показываем сразу.
    watchCache(const ['/api/messenger/conversations'], () => _load(silent: true));
    // Пришло, изменилось или прочитано сообщение — список обновляется сам, без открытия раздела.
    _chatEvents = session.realtime.chatEvents.listen((_) {
      _eventDebounce?.cancel();
      _eventDebounce = Timer(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        session.cache.invalidate('/api/messenger/conversations');
        _load(silent: true);
      });
    });
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await (widget.loadConversations?.call() ?? ChurchApi(context.read<SessionController>()).conversations());
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      if (silent) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  String _title(Map<String, dynamic> item) {
    final other = asMap(item['other_member']);
    if (str(item['title']).isNotEmpty) return str(item['title']);
    return str(other['name']).isEmpty ? 'Чат' : str(other['name']);
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final other = asMap(item['other_member']);
    final otherId = asInt(other['id']);
    await pushPage(
      context,
      ThreadPage(
        conversationId: str(item['id']),
        title: _title(item),
        otherMemberId: otherId > 0 ? otherId : null,
        avatarUrl: resolveUrl(context.read<SessionController>().apiOrigin, str(other['avatar_url'] ?? item['avatar_url'])),
        lastSeen: str(other['last_seen_at']),
        type: str(item['type']).isEmpty ? 'private' : str(item['type']),
        muted: asBool(item['my_muted']),
      ),
    );
    _load();
  }

  void _patchItem(String id, Map<String, dynamic> Function(Map<String, dynamic>) change) {
    setState(() => _items = [for (final raw in _items) str(asMap(raw)['id']) == id ? change(asMap(raw)) : raw]);
  }

  /// Долгое нажатие на чат: меню действий, как на сайте.
  Future<void> _showMenu(Map<String, dynamic> item) async {
    final id = str(item['id']);
    final model = ChatListMenuModel.from(item);
    final command = await showChatListMenu(context, title: _title(item), model: model);
    if (command == null || !mounted) return;
    try {
      switch (command) {
        case ChatListCommand.pin:
          await _actions.setPinned(id, !model.pinned);
          _patchItem(id, (it) => applyChatPreference(it, pinned: !model.pinned));
          await _load(silent: true);
        case ChatListCommand.mute:
          await _actions.setMuted(id, !model.muted);
          _patchItem(id, (it) => applyChatPreference(it, muted: !model.muted));
        case ChatListCommand.clear:
          final ok = await confirmChatAction(context, title: ChatListMenuModel.clearConfirmTitle, text: ChatListMenuModel.clearConfirmText, action: 'Очистить');
          if (!ok || !mounted) return;
          await _actions.clearHistory(id);
          await _load(silent: true);
          if (mounted) showMessage(context, 'Переписка очищена');
        case ChatListCommand.delete:
          final ok = await confirmChatAction(context, title: model.deleteConfirmTitle, text: model.deleteConfirmText, action: model.deleteConfirmAction);
          if (!ok || !mounted) return;
          await _actions.leave(id);
          setState(() => _items = [for (final raw in _items) if (str(asMap(raw)['id']) != id) raw]);
      }
    } catch (error) {
      if (mounted) showMessage(context, 'Не получилось: ${describeDio(error)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final origin = context.watch<SessionController>().apiOrigin;
    final counts = <String, int>{'private': 0, 'group': 0, 'channel': 0};
    for (final raw in _items) {
      final type = str(asMap(raw)['type']);
      if (counts.containsKey(type)) counts[type] = counts[type]! + 1;
    }
    final q = _query.text.trim().toLowerCase();
    final visible = _items.where((raw) {
      final item = asMap(raw);
      if (_filter != 'all' && str(item['type']) != _filter) return false;
      return q.isEmpty || _title(item).toLowerCase().contains(q);
    }).toList();
    final chips = <(String, String, int?)>[
      ('all', 'Все', _items.length),
      if (counts['private']! > 0) ('private', 'Личные', counts['private']),
      if (counts['group']! > 0) ('group', 'Группы', counts['group']),
      if (counts['channel']! > 0) ('channel', 'Каналы', counts['channel']),
    ];
    return ChurchPage(
      title: 'Чаты',
      actions: [
        HeaderButton(
          icon: Icons.video_call_outlined,
          tooltip: 'Конференция',
          onPressed: () => showMeetingKindSheet(context),
        ),
        HeaderButton(
          icon: Icons.edit_outlined,
          tooltip: 'Новое сообщение',
          accent: true,
          onPressed: () async {
            await pushPage(context, const NewChatPage());
            _load();
          },
        ),
      ],
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint(
                'Чатов пока нет',
                icon: Icons.chat_bubble_outline_rounded,
                hint: 'Начните переписку — нажмите на карандаш вверху.',
              )
            : SheetList(
                onRefresh: _load,
                children: [
                  ChurchSearchField(controller: _query, hint: 'Поиск', onChanged: (_) => setState(() {})),
                  if (chips.length > 2)
                    FilterChips<String>(
                      items: chips,
                      selected: _filter,
                      onChanged: (value) => setState(() => _filter = value),
                    ),
                  if (visible.isEmpty)
                    const EmptyHint('Ничего не найдено', icon: Icons.search_off_rounded)
                  else
                    ListGroup(
                      children: [
                        for (final raw in visible) _ChatRow(item: asMap(raw), title: _title(asMap(raw)), origin: origin, onTap: () => _open(asMap(raw)), onLongPress: () => _showMenu(asMap(raw))),
                      ],
                    ),
                ],
              ),
      ),
    );
  }
}

class _ChatRow extends StatelessWidget {
  const _ChatRow({required this.item, required this.title, required this.origin, required this.onTap, required this.onLongPress});

  final Map<String, dynamic> item;
  final String title;
  final String origin;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final other = asMap(item['other_member']);
    final last = asMap(item['last_message']);
    final unread = asInt(item['unread_count']);
    final sender = str(last['sender_name']);
    final text = asBool(last['is_deleted'])
        ? 'Сообщение удалено'
        : (str(last['content']).isEmpty ? str(last['payload_type']) : str(last['content']));
    final preview = sender.isNotEmpty && str(item['type']) != 'private' && !asBool(last['is_deleted']) ? '$sender: $text' : text;
    final type = str(item['type']);
    final avatarUrl = resolveUrl(origin, str(other['avatar_url']).isNotEmpty ? str(other['avatar_url']) : str(item['avatar_url']));
    final pinned = asBool(item['my_ui_pinned']);
    final muted = asBool(item['my_muted']);
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            if (type == 'channel' && avatarUrl.isEmpty)
              const ChurchLogo(size: 46, circle: true)
            else
              ChurchAvatar(name: title, imageUrl: avatarUrl, size: 46),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (type == 'group' || type == 'channel') ...[
                        Icon(type == 'group' ? Icons.group_outlined : Icons.campaign_outlined, size: 15, color: ChurchColors.amberBlob),
                        const SizedBox(width: 4),
                      ],
                      Expanded(
                        child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ChurchType.title.copyWith(color: palette.ink)),
                      ),
                      if (muted) Padding(padding: const EdgeInsets.only(left: 4), child: Icon(Icons.volume_off_rounded, size: 14, color: palette.inkFaint)),
                      const SizedBox(width: 8),
                      Text(chatStamp(last['created_at']), style: TextStyle(fontSize: 12, color: unread > 0 ? palette.accent : palette.inkFaint)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          preview.isEmpty ? 'Нет сообщений' : preview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontStyle: asBool(last['is_deleted']) ? FontStyle.italic : FontStyle.normal,
                            color: palette.inkMuted,
                          ),
                        ),
                      ),
                      if (unread > 0)
                        ...[const SizedBox(width: 8), CountBadge(unread)]
                      else if (pinned)
                        ...[const SizedBox(width: 8), Icon(Icons.push_pin, size: 15, color: palette.inkFaint)],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
