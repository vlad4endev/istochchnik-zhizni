import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class SermonsPage extends StatefulWidget {
  const SermonsPage({super.key});

  @override
  State<SermonsPage> createState() => _SermonsPageState();
}

class _SermonsPageState extends State<SermonsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _episodes = const [];
  List<dynamic> _notes = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ChurchApi(context.read<SessionController>());
    try {
      final feed = await api.podcasts();
      List<dynamic> notes = const [];
      try {
        notes = await api.sermonNotes();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _episodes = asList(feed['episodes']);
        _notes = notes;
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
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Проповеди')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          children: [
            if (_notes.isNotEmpty) const ListTile(title: Text('Мои конспекты')),
            for (final raw in _notes)
              ListTile(
                leading: const Icon(Icons.edit_note),
                title: Text(str(asMap(raw)['title']).isEmpty ? 'Конспект' : str(asMap(raw)['title'])),
                subtitle: Text(str(asMap(raw)['updated_at'])),
              ),
            const ListTile(title: Text('Записи')),
            if (_episodes.isEmpty) const EmptyHint('Записей проповедей нет'),
            for (final raw in _episodes)
              ListTile(
                leading: const Icon(Icons.play_circle_outline),
                title: Text(str(asMap(raw)['title'])),
                subtitle: Text(str(asMap(raw)['description']), maxLines: 2, overflow: TextOverflow.ellipsis),
                onTap: () => _open(str(asMap(raw)['audioUrl'])),
              ),
          ],
        ),
      ),
    );
  }
}
