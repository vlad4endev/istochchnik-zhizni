import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/chord_sheet.dart';
import '../../ui/widgets.dart';

class StudioPage extends StatefulWidget {
  const StudioPage({super.key});

  @override
  State<StudioPage> createState() => _StudioPageState();
}

class _StudioPageState extends State<StudioPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _setlists = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final setlists = await ChurchApi(context.read<SessionController>()).setlists();
      if (!mounted) return;
      setState(() {
        _setlists = setlists;
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
      appBar: AppBar(title: const Text('Студия')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _setlists.isEmpty
            ? const EmptyHint('Сетлистов пока нет')
            : ListView.builder(
                itemCount: _setlists.length,
                itemBuilder: (context, index) {
                  final row = asMap(_setlists[index]);
                  return ListTile(
                    title: Text(str(row['title'])),
                    subtitle: Text(str(row['event_date'])),
                    onTap: () => pushPage(context, SetlistPage(id: str(row['id']), title: str(row['title']))),
                  );
                },
              ),
      ),
    );
  }
}

class SetlistPage extends StatefulWidget {
  const SetlistPage({super.key, required this.id, required this.title});
  final String id;
  final String title;

  @override
  State<SetlistPage> createState() => _SetlistPageState();
}

class _SetlistPageState extends State<SetlistPage> {
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
      final items = await ChurchApi(context.read<SessionController>()).setlistItems(widget.id);
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
      appBar: AppBar(title: Text(widget.title.isEmpty ? 'Сетлист' : widget.title)),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('В сетлисте нет песен')
            : ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, index) {
                  final item = asMap(_items[index]);
                  final song = asMap(item['song']);
                  return ListTile(
                    leading: CircleAvatar(child: Text('${index + 1}')),
                    title: Text(str(song['title']).isEmpty ? str(item['effective_content_preview']) : str(song['title'])),
                    subtitle: Text(str(item['effective_key'])),
                    onTap: () => pushPage(
                      context,
                      LyricPage(
                        title: str(song['title']),
                        content: str(item['effective_content']).isEmpty ? str(song['content']) : str(item['effective_content']),
                        keyName: str(item['effective_key']),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
