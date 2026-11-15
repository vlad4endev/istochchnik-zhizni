import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/chord_sheet.dart';
import '../../ui/kit/kit.dart';
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
    return ChurchPage(
      title: 'Студия',
      subtitle: 'Сетлисты команды прославления',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _setlists.isEmpty
            ? const EmptyHint('Сетлистов пока нет', icon: Icons.queue_music_rounded)
            : SheetList(
                onRefresh: _load,
                children: [
                  ListGroup(
                    children: [
                      for (final raw in _setlists)
                        Builder(builder: (context) {
                          final row = asMap(raw);
                          final date = parseApiDate(row['event_date']);
                          return ListRow(
                            leading: const IconTile(Icons.queue_music_rounded, tone: Tone.violet),
                            title: str(row['title']).isEmpty ? 'Сетлист' : str(row['title']),
                            subtitle: date == null ? str(row['event_date']) : '${weekdayName(date)}, ${longDate(date)}',
                            onTap: () => pushPage(context, SetlistPage(id: str(row['id']), title: str(row['title']))),
                          );
                        }),
                    ],
                  ),
                ],
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
    final palette = context.palette;
    return ChurchPage(
      title: widget.title.isEmpty ? 'Сетлист' : widget.title,
      subtitle: _items.isEmpty ? null : 'Песен: ${_items.length}',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('В сетлисте нет песен', icon: Icons.music_off_outlined)
            : SheetList(
                children: [
                  ListGroup(
                    dividerIndent: 64,
                    children: [
                      for (var index = 0; index < _items.length; index++)
                        Builder(builder: (context) {
                          final item = asMap(_items[index]);
                          final song = asMap(item['song']);
                          final key = str(item['effective_key']);
                          final title = str(song['title']).isEmpty ? str(item['effective_content_preview']) : str(song['title']);
                          return ListRow(
                            leading: Container(
                              width: 38,
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(Radii.sm)),
                              child: Text('${index + 1}', style: TextStyle(fontWeight: FontWeight.w800, color: palette.accent)),
                            ),
                            title: title.isEmpty ? 'Песня' : title,
                            trailing: key.isEmpty ? null : StatusPill(key),
                            chevron: true,
                            onTap: () => pushPage(
                              context,
                              LyricPage(
                                title: str(song['title']),
                                content: str(item['effective_content']).isEmpty ? str(song['content']) : str(item['effective_content']),
                                keyName: key,
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}
