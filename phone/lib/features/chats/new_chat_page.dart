import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';
import 'thread_page.dart';

class NewChatPage extends StatefulWidget {
  const NewChatPage({super.key});

  @override
  State<NewChatPage> createState() => _NewChatPageState();
}

class _NewChatPageState extends State<NewChatPage> {
  final _query = TextEditingController();
  bool _loading = true;
  String? _error;
  List<dynamic> _people = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final people = await ChurchApi(context.read<SessionController>()).searchMembers(_query.text.trim());
      if (!mounted) return;
      setState(() {
        _people = people;
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

  Future<void> _open(Map<String, dynamic> person) async {
    final id = asInt(person['id']);
    final name = str(person['name']).isEmpty ? '${str(person['first_name'])} ${str(person['last_name'])}'.trim() : str(person['name']);
    try {
      final conversationId = await ChurchApi(context.read<SessionController>()).openPersonal(id);
      if (!mounted || conversationId.isEmpty) return;
      await pushPage(
        context,
        ThreadPage(conversationId: conversationId, title: name.isEmpty ? 'Чат' : name, otherMemberId: id),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Новый чат')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _query,
              decoration: const InputDecoration(hintText: 'Имя'),
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: ListView.builder(
                itemCount: _people.length,
                itemBuilder: (context, index) {
                  final person = asMap(_people[index]);
                  final name = str(person['name']).isEmpty
                      ? '${str(person['first_name'])} ${str(person['last_name'])}'.trim()
                      : str(person['name']);
                  return ListTile(
                    title: Text(name.isEmpty ? 'Участник' : name),
                    onTap: () => _open(person),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
