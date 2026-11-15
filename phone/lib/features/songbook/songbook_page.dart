import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/chord_sheet.dart';
import '../../ui/widgets.dart';

class SongbookPage extends StatefulWidget {
  const SongbookPage({super.key});

  @override
  State<SongbookPage> createState() => _SongbookPageState();
}

class _SongbookPageState extends State<SongbookPage> {
  final _query = TextEditingController();
  bool _loading = true;
  String? _error;
  List<dynamic> _songs = const [];

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
      final songs = await ChurchApi(context.read<SessionController>()).songs(_query.text);
      if (!mounted) return;
      setState(() {
        _songs = songs;
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
      appBar: AppBar(title: const Text('Песенник')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _query,
              decoration: InputDecoration(
                hintText: 'Поиск песни',
                suffixIcon: IconButton(onPressed: _load, icon: const Icon(Icons.search)),
              ),
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: _songs.isEmpty
                  ? const EmptyHint('Ничего не найдено')
                  : ListView.builder(
                      itemCount: _songs.length,
                      itemBuilder: (context, index) {
                        final song = asMap(_songs[index]);
                        return ListTile(
                          title: Text(str(song['title'])),
                          subtitle: Text(str(song['default_key']).isEmpty ? 'Без тональности' : 'Тональность ${str(song['default_key'])}'),
                          onTap: () => pushPage(context, SongPage(id: str(song['id']), title: str(song['title']))),
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

class SongPage extends StatefulWidget {
  const SongPage({super.key, required this.id, required this.title});
  final String id;
  final String title;

  @override
  State<SongPage> createState() => _SongPageState();
}

class _SongPageState extends State<SongPage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _song = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final song = await ChurchApi(context.read<SessionController>()).song(widget.id);
      if (!mounted) return;
      setState(() {
        _song = song;
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
      appBar: AppBar(title: Text(widget.title)),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (str(_song['default_key']).isNotEmpty)
              Text('Тональность ${str(_song['default_key'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ChordSheet(content: str(_song['content'])),
          ],
        ),
      ),
    );
  }
}
