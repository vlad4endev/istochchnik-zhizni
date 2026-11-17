import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/audio_player_page.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'sermon_editor_page.dart';

class SermonsPage extends StatefulWidget {
  const SermonsPage({super.key});

  @override
  State<SermonsPage> createState() => _SermonsPageState();
}

class _SermonsPageState extends State<SermonsPage> {
  final _query = TextEditingController();
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _feed = {};
  List<dynamic> _episodes = const [];
  List<dynamic> _notes = const [];

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
    final api = ChurchApi(context.read<SessionController>());
    try {
      final feed = await api.podcasts();
      List<dynamic> notes = const [];
      try {
        notes = await api.sermonNotes();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _feed = asMap(feed['feed']);
        _episodes = asList(feed['episodes']);
        _notes = notes;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _edit(Map<String, dynamic>? note) async {
    final saved = await pushPage<bool>(context, SermonEditorPage(note: note));
    if (saved == true) _load();
  }

  void _play(Map<String, dynamic> episode) {
    final url = str(episode['audioUrl']);
    if (url.isEmpty) return;
    pushPage(context, AudioPlayerPage(url: url, title: str(episode['title'])));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final preacher = context.watch<SessionController>().user?.isPreacher == true;
    final q = _query.text.trim().toLowerCase();
    final episodes = _episodes.map(asMap).where((e) {
      if (q.isEmpty) return true;
      return str(e['title']).toLowerCase().contains(q) || str(e['description']).toLowerCase().contains(q);
    }).toList();
    return ChurchPage(
      title: 'Проповеди',
      floatingActionButton: preacher ? ChurchFab(tooltip: 'Новый конспект', onPressed: () => _edit(null)) : null,
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 96),
          children: [
            ChurchCard(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const ChurchLogo(size: 76),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          str(_feed['title']).isEmpty ? 'Аудио проповеди' : str(_feed['title']),
                          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: palette.ink),
                        ),
                        if (str(_feed['description']).isNotEmpty)
                          Text(
                            str(_feed['description']),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: ChurchType.caption.copyWith(color: palette.inkMuted),
                          ),
                        const SizedBox(height: 4),
                        Text('${_episodes.length} выпусков', style: TextStyle(fontSize: 12, color: palette.inkFaint)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (_episodes.length > 3)
              ChurchSearchField(controller: _query, hint: 'Поиск по названию или описанию', onChanged: (_) => setState(() {})),
            if (_notes.isNotEmpty) ...[
              const SectionLabel('Мои конспекты'),
              ListGroup(
                children: [
                  for (final raw in _notes)
                    ListRow(
                      leading: const IconTile(Icons.edit_note_rounded, tone: Tone.rose),
                      title: str(asMap(raw)['title']).isEmpty ? 'Конспект' : str(asMap(raw)['title']),
                      subtitle: str(asMap(raw)['scripture']),
                      onTap: () => _edit(asMap(raw)),
                    ),
                ],
              ),
            ],
            const SectionLabel('Записи'),
            if (episodes.isEmpty)
              EmptyHint(q.isEmpty ? 'Записей проповедей нет' : 'Ничего не найдено', icon: Icons.mic_off_outlined)
            else
              for (final episode in episodes) _EpisodeCard(episode: episode, onPlay: () => _play(episode)),
          ],
        ),
      ),
    );
  }
}

class _EpisodeCard extends StatelessWidget {
  const _EpisodeCard({required this.episode, required this.onPlay});

  final Map<String, dynamic> episode;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final when = parseApiDate(episode['pubDate']);
    final length = durationLabel(asInt(episode['duration']));
    final fresh = when != null && DateTime.now().difference(when).inDays < 7;
    final description = str(episode['description']);
    return ChurchCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ChurchLogo(size: 50),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      str(episode['title']),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ChurchType.title.copyWith(fontSize: 16, color: palette.ink),
                    ),
                    if (description.isNotEmpty)
                      Text(
                        description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ChurchType.caption.copyWith(color: palette.inkMuted),
                      ),
                    if (when != null || length.isNotEmpty)
                      Text(
                        [if (when != null) longDate(when), length].where((part) => part.isNotEmpty).join(' · '),
                        style: TextStyle(fontSize: 12, color: palette.inkFaint),
                      ),
                  ],
                ),
              ),
              if (fresh) ...[const SizedBox(width: 8), const StatusPill('НОВОЕ')],
            ],
          ),
          const SizedBox(height: Space.md),
          PrimaryButton(
            label: 'Слушать',
            icon: Icons.play_arrow_rounded,
            height: 46,
            onPressed: str(episode['audioUrl']).isEmpty ? null : onPlay,
          ),
        ],
      ),
    );
  }
}
