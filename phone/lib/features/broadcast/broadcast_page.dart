import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class BroadcastPage extends StatefulWidget {
  const BroadcastPage({super.key});

  @override
  State<BroadcastPage> createState() => _BroadcastPageState();
}

class _BroadcastPageState extends State<BroadcastPage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _active = {};
  List<dynamic> _history = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ChurchApi(context.read<SessionController>());
    try {
      final active = await api.broadcast();
      Object? history;
      try {
        history = await api.broadcastHistory();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _active = asMap(active['broadcast']);
        _history = history is List ? history : asList(asMap(history)['broadcasts']);
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

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || url.isEmpty) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Трансляция')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          children: [
            if (_active.isEmpty)
              const ListTile(title: Text('Сейчас эфира нет'))
            else
              ListTile(
                leading: const Icon(Icons.sensors),
                title: Text(str(_active['title']).isEmpty ? 'Трансляция' : str(_active['title'])),
                subtitle: Text(str(_active['description'])),
                trailing: const Icon(Icons.open_in_new),
                onTap: () => _open(str(_active['stream_url'])),
              ),
            if (_history.isNotEmpty) const ListTile(title: Text('Прошедшие')),
            for (final raw in _history)
              ListTile(
                title: Text(str(asMap(raw)['title'])),
                subtitle: Text(str(asMap(raw)['starts_at'])),
                onTap: () => _open(str(asMap(raw)['stream_url'])),
              ),
          ],
        ),
      ),
    );
  }
}
