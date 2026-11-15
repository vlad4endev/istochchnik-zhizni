import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
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
      showMessage(context, describeDio(error));
    }
  }

  String _name(Map<String, dynamic> person) {
    final name = str(person['name']).isEmpty
        ? '${str(person['first_name'])} ${str(person['last_name'])}'.trim()
        : str(person['name']);
    return name.isEmpty ? 'Участник' : name;
  }

  @override
  Widget build(BuildContext context) {
    final origin = context.watch<SessionController>().apiOrigin;
    return ChurchPage(
      title: 'Новое сообщение',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 0),
            child: ChurchSearchField(
              controller: _query,
              hint: 'Поиск участников…',
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: _people.isEmpty
                  ? const EmptyHint('Никого не нашли', icon: Icons.person_search_outlined, hint: 'Проверьте имя или фамилию')
                  : SheetList(
                      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 32),
                      children: [
                        ListGroup(
                          children: [
                            for (final raw in _people)
                              ListRow(
                                leading: ChurchAvatar(
                                  name: _name(asMap(raw)),
                                  imageUrl: resolveUrl(origin, str(asMap(raw)['avatar_url'])),
                                ),
                                title: _name(asMap(raw)),
                                trailing: Icon(Icons.chat_bubble_outline_rounded, size: 20, color: context.palette.accent),
                                onTap: () => _open(asMap(raw)),
                              ),
                          ],
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
