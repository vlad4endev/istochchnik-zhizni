import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class EventsPage extends StatefulWidget {
  const EventsPage({super.key});

  @override
  State<EventsPage> createState() => _EventsPageState();
}

class _EventsPageState extends State<EventsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _events = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final events = await ChurchApi(context.read<SessionController>()).events();
      if (!mounted) return;
      setState(() {
        _events = events;
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
      appBar: AppBar(title: const Text('Мероприятия')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _events.isEmpty
            ? const EmptyHint('Активных мероприятий нет')
            : ListView.builder(
                itemCount: _events.length,
                itemBuilder: (context, index) {
                  final event = asMap(_events[index]);
                  return Card(
                    margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: ListTile(
                      title: Text(str(event['title'])),
                      subtitle: Text(
                        '${str(event['event_date'])} ${str(event['event_time'])}\n${str(event['description'])}',
                      ),
                      isThreeLine: str(event['description']).isNotEmpty,
                    ),
                  );
                },
              ),
      ),
    );
  }
}
