import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/chord_sheet.dart';
import '../../ui/kit/kit.dart';
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
    final palette = context.palette;
    final songs = _songs.map(asMap).toList()
      ..sort((a, b) => str(a['title']).toLowerCase().compareTo(str(b['title']).toLowerCase()));
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final song in songs) {
      final title = str(song['title']).trim();
      final letter = title.isEmpty ? '#' : title.substring(0, 1).toUpperCase();
      groups.putIfAbsent(RegExp(r'[А-ЯЁA-Z]').hasMatch(letter) ? letter : '#', () => []).add(song);
    }
    return ChurchPage(
      title: 'Песенник',
      subtitle: _songs.isEmpty ? 'Тексты и аккорды' : 'Тексты и аккорды · ${_songs.length} песен',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 0),
            child: ChurchSearchField(
              controller: _query,
              hint: 'Название или строка из песни',
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: _songs.isEmpty
                  ? const EmptyHint('Ничего не найдено', icon: Icons.library_music_outlined, hint: 'Попробуйте другое слово')
                  : SheetList(
                      onRefresh: _load,
                      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 32),
                      gap: Space.sm,
                      children: [
                        for (final entry in groups.entries) ...[
                          SectionLabel(entry.key, padding: const EdgeInsets.fromLTRB(6, 6, 4, 0)),
                          ListGroup(
                            dividerIndent: 14,
                            children: [
                              for (final song in entry.value)
                                ListRow(
                                  title: str(song['title']),
                                  trailing: str(song['default_key']).isEmpty
                                      ? null
                                      : Container(
                                          constraints: const BoxConstraints(minWidth: 30),
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(99)),
                                          child: Text(
                                            str(song['default_key']),
                                            textAlign: TextAlign.center,
                                            semanticsLabel: 'Тональность ${str(song['default_key'])}',
                                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.accent),
                                          ),
                                        ),
                                  chevron: true,
                                  onTap: () => pushPage(context, SongPage(id: str(song['id']), title: str(song['title']))),
                                ),
                            ],
                          ),
                        ],
                      ],
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
    return SongView(
      title: str(_song['title']).isEmpty ? widget.title : str(_song['title']),
      content: str(_song['content']),
      keyName: str(_song['default_key']),
      loading: _loading,
      error: _error,
      onRetry: () {
        setState(() {
          _loading = true;
          _error = null;
        });
        _load();
      },
    );
  }
}
