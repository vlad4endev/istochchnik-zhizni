import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';
import 'new_chat_page.dart';
import 'thread_page.dart';

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
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await pushPage(context, const NewChatPage());
          _load();
        },
        child: const Icon(Icons.edit),
      ),
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
                    final preview = asBool(last['is_deleted'])
                        ? 'Сообщение удалено'
                        : (str(last['content']).isEmpty ? str(last['payload_type']) : str(last['content']));
                    return ListTile(
                      leading: CircleAvatar(child: Text(title.isEmpty ? '?' : title.substring(0, 1))),
                      title: Text(title),
                      subtitle: Text(preview, maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: unread > 0
                          ? CircleAvatar(
                              radius: 12,
                              child: Text('$unread', style: const TextStyle(fontSize: 11)),
                            )
                          : null,
                      onTap: () async {
                        final otherId = asInt(other['id']);
                        await pushPage(
                          context,
                          ThreadPage(
                            conversationId: str(item['id']),
                            title: title,
                            otherMemberId: otherId > 0 ? otherId : null,
                          ),
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
