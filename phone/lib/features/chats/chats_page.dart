import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class ChatsPage extends StatefulWidget {
  const ChatsPage({super.key});

  @override
  State<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends State<ChatsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = const [];

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
    try {
      final items = await ChurchApi(context.read<SessionController>()).conversations();
      if (!mounted) return;
      setState(() {
        _items = items;
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
    return Scaffold(
      appBar: AppBar(title: const Text('Чаты')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('Чатов пока нет')
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView.builder(
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = asMap(_items[index]);
                    final other = asMap(item['other_member']);
                    final title = str(item['title']).isNotEmpty
                        ? str(item['title'])
                        : (str(other['name']).isEmpty ? 'Чат' : str(other['name']));
                    final last = asMap(item['last_message']);
                    final unread = asInt(item['unread_count']);
                    return ListTile(
                      leading: CircleAvatar(child: Text(title.isEmpty ? '?' : title.substring(0, 1))),
                      title: Text(title),
                      subtitle: Text(
                        asBool(last['is_deleted']) ? 'Сообщение удалено' : str(last['content']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: unread > 0
                          ? CircleAvatar(
                              radius: 12,
                              child: Text('$unread', style: const TextStyle(fontSize: 11)),
                            )
                          : null,
                      onTap: () async {
                        await pushPage(
                          context,
                          ThreadPage(conversationId: str(item['id']), title: title),
                        );
                        _load();
                      },
                    );
                  },
                ),
              ),
      ),
    );
  }
}

class ThreadPage extends StatefulWidget {
  const ThreadPage({super.key, required this.conversationId, required this.title});
  final String conversationId;
  final String title;

  @override
  State<ThreadPage> createState() => _ThreadPageState();
}

class _ThreadPageState extends State<ThreadPage> {
  final _input = TextEditingController();
  bool _loading = true;
  String? _error;
  List<dynamic> _messages = const [];
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final messages = await ChurchApi(context.read<SessionController>()).messages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _messages = messages.reversed.toList();
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ChurchApi(context.read<SessionController>()).sendMessage(widget.conversationId, text);
      _input.clear();
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionController>().user?.id;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: ListView.builder(
                reverse: true,
                padding: const EdgeInsets.all(12),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final message = asMap(_messages[index]);
                  final mine = asInt(message['sender_id']) == me;
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                      decoration: BoxDecoration(
                        color: mine
                            ? Theme.of(context).colorScheme.primaryContainer
                            : Theme.of(context).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(asBool(message['is_deleted']) ? 'Сообщение удалено' : str(message['content'])),
                    ),
                  );
                },
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(hintText: 'Сообщение'),
                    ),
                  ),
                  IconButton(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
