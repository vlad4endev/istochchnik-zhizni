import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class CallsPage extends StatefulWidget {
  const CallsPage({super.key});

  @override
  State<CallsPage> createState() => _CallsPageState();
}

class _CallsPageState extends State<CallsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ChurchApi(context.read<SessionController>()).calls();
      if (!mounted) return;
      setState(() {
        _items = asList(data['items']);
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
      appBar: AppBar(title: const Text('Звонки')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Журнал звонков церкви. Разговор внутри приложения (аудио и видео, как на сайте) подключается следующим шагом — для него нужен нативный LiveKit.',
              ),
            ),
            if (_items.isEmpty) const EmptyHint('Звонков пока нет'),
            for (final raw in _items)
              ListTile(
                leading: Icon(str(asMap(raw)['call_type']) == 'video' ? Icons.videocam_outlined : Icons.call_outlined),
                title: Text(str(asMap(raw)['title']).isEmpty ? 'Звонок' : str(asMap(raw)['title'])),
                subtitle: Text('${str(asMap(raw)['status'])} · ${str(asMap(raw)['created_at'])}'),
              ),
          ],
        ),
      ),
    );
  }
}
