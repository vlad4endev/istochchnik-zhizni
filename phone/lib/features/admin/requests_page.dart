import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class RequestsPage extends StatefulWidget {
  const RequestsPage({super.key});

  @override
  State<RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<RequestsPage> {
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
      final items = await ChurchApi(context.read<SessionController>()).accessRequests();
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

  Future<void> _review(int id, {required bool approve}) async {
    try {
      await ChurchApi(context.read<SessionController>()).reviewRequest(id, approve: approve);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Заявки')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('Новых заявок нет')
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, index) {
                  final item = asMap(_items[index]);
                  final id = asInt(item['id']);
                  return Card(
                    margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${str(item['first_name'])} ${str(item['last_name'])}', style: Theme.of(context).textTheme.titleMedium),
                          Text(str(item['phone_number'])),
                          Text(str(item['request_type']) == 'password_reset' ? 'Сброс пароля' : 'Регистрация'),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              FilledButton(onPressed: () => _review(id, approve: true), child: const Text('Принять')),
                              const SizedBox(width: 8),
                              OutlinedButton(onPressed: () => _review(id, approve: false), child: const Text('Отклонить')),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
