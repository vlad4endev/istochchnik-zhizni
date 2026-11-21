import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../schedule/logic/schedule_labels.dart';
import '../songbook/data/songbook_repository.dart';
import '../songbook/models/song.dart';
import '../songbook/song_reader_page.dart';
import 'data/studio_repository.dart';
import 'models/studio_models.dart';
import 'setlist_page.dart';
import 'studio_controllers.dart';

enum _Tab { setlists, versions }

/// Студия: сетлисты команды прославления и мои версии песен.
class StudioPage extends StatefulWidget {
  const StudioPage({super.key, this.source, this.loadSongs, this.userId});

  /// Для тестов; в приложении источник создаётся из сессии.
  final StudioSource? source;
  final Future<List<Song>> Function()? loadSongs;
  final int? userId;

  @override
  State<StudioPage> createState() => _StudioPageState();
}

class _StudioPageState extends State<StudioPage> {
  late final StudioSource _source;
  late final StudioController _c;
  _Tab _tab = _Tab.setlists;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _source = widget.source ?? StudioRepository(session);
    _c = StudioController(_source, userId: widget.userId ?? session.user?.id ?? 0)..load();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _open(Setlist setlist) async {
    final result = await pushPage<Object?>(
      context,
      SetlistPage(setlist: setlist, source: _source, onChanged: _c.replace, loadSongs: widget.loadSongs, userId: widget.userId),
    );
    if (result == 'deleted') await _c.load();
  }

  Future<void> _create() async {
    final draft = await showDialog<({String title, DateTime? date})>(context: context, builder: (_) => const _NewSetlistDialog());
    if (draft == null) return;
    try {
      final created = await _c.create(draft.title, draft.date);
      if (mounted) await _open(created);
    } catch (error) {
      if (mounted) showMessage(context, 'Не удалось создать сетлист: ${describeDio(error)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) => ChurchPage(
        title: 'Студия',
        subtitle: 'Сетлисты команды прославления',
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 4),
              child: SegmentedPills<_Tab>(
                segments: const [(_Tab.setlists, 'Сетлисты'), (_Tab.versions, 'Мои песни')],
                selected: _tab,
                onChanged: (t) => setState(() => _tab = t),
              ),
            ),
            Expanded(child: _tab == _Tab.setlists ? _setlists() : _VersionsTab(source: _source, loadSongs: widget.loadSongs)),
          ],
        ),
      ),
    );
  }

  Widget _setlists() {
    if (_c.loading && !_c.hasSetlists) return const LoadingView();
    if (_c.error != null && !_c.hasSetlists) return ErrorView(message: _c.error!, onRetry: _c.load);
    final stale = _c.staleSince;
    Widget section(String title, List<Setlist> list) => list.isEmpty
        ? const SizedBox.shrink()
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionLabel(title),
              const SizedBox(height: Space.sm),
              for (final s in list) Padding(padding: const EdgeInsets.only(bottom: Space.md), child: _SetlistCard(setlist: s, today: _c.today, mine: _c.isMine(s), onTap: () => _open(s))),
            ],
          );
    return SheetList(
      onRefresh: _c.load,
      gap: Space.sm,
      children: [
        if (stale != null) InfoBanner('Нет связи — показаны сетлисты, сохранённые ${relativeTime(stale.toIso8601String())}'),
        PrimaryButton(label: 'Новый сетлист', icon: Icons.add_rounded, height: 50, onPressed: stale != null ? null : _create),
        if (!_c.hasSetlists)
          const EmptyHint('Сетлистов пока нет', icon: Icons.queue_music_rounded, hint: 'Создайте сетлист на репетицию или служение и добавьте в него песни.')
        else ...[
          section('Ближайшие', _c.upcoming),
          section('Без даты', _c.undated),
          section('Прошедшие', _c.past),
        ],
      ],
    );
  }
}

class _SetlistCard extends StatelessWidget {
  const _SetlistCard({required this.setlist, required this.today, required this.mine, required this.onTap});

  final Setlist setlist;
  final DateTime today;
  final bool mine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final date = setlist.date;
    return Semantics(
      button: true,
      label: '${setlist.displayTitle}. ${date == null ? 'Без даты' : friendlyDay(date, today)}',
      excludeSemantics: true,
      child: ChurchCard(
        onTap: onTap,
        child: Row(
          children: [
            if (date != null) DateBadge(date: date) else const IconTile(Icons.queue_music_rounded, tone: Tone.violet, size: 52, radius: Radii.md),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (date != null) Text(friendlyDay(date, today), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                  Text(setlist.displayTitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink)),
                  if (!mine || setlist.isPublic)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (!mine) const StatusPill('Из программы служения', tone: Tone.teal),
                          if (setlist.isPublic) const StatusPill('Доступ по ссылке', tone: Tone.green),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: palette.chevron),
          ],
        ),
      ),
    );
  }
}

class _NewSetlistDialog extends StatefulWidget {
  const _NewSetlistDialog();

  @override
  State<_NewSetlistDialog> createState() => _NewSetlistDialogState();
}

class _NewSetlistDialogState extends State<_NewSetlistDialog> {
  final _title = TextEditingController();
  DateTime? _date;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(DateTime.now().year + 3),
      helpText: 'Дата сетлиста',
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Новый сетлист'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _title,
            autofocus: true,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Название', hintText: 'Воскресное служение'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pick,
            icon: const Icon(Icons.event_outlined),
            label: Text(_date == null ? 'Дата (по желанию)' : longDate(_date!)),
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
        TextButton(
          onPressed: _title.text.trim().isEmpty ? null : () => Navigator.pop(context, (title: _title.text.trim(), date: _date)),
          child: const Text('Создать'),
        ),
      ],
    );
  }
}

/// Мои версии песен: свой текст и тональность поверх общей песни.
class _VersionsTab extends StatefulWidget {
  const _VersionsTab({required this.source, this.loadSongs});
  final StudioSource source;
  final Future<List<Song>> Function()? loadSongs;

  @override
  State<_VersionsTab> createState() => _VersionsTabState();
}

class _VersionsTabState extends State<_VersionsTab> {
  bool _loading = true;
  String? _error;
  List<MyVersion> _versions = const [];
  int? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _versions.isEmpty;
      _error = null;
    });
    try {
      final list = await widget.source.myVersions();
      if (!mounted) return;
      setState(() {
        _versions = [...list]..sort((a, b) => (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
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

  Future<void> _open(MyVersion v) async {
    setState(() => _busy = v.versionId);
    try {
      final session = context.read<SessionController>();
      final repo = SongbookRepository(session);
      final songs = widget.loadSongs != null ? await widget.loadSongs!() : ((await repo.readCache())?.songs ?? await repo.fetch());
      final song = songs.where((s) => s.id == v.songId).firstOrNull;
      if (!mounted) return;
      if (song == null) {
        showMessage(context, 'Этой песни больше нет в песеннике.');
      } else {
        await pushPage(context, SongReaderPage(song: song, source: repo, useMyVersion: true));
      }
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось открыть песню — проверьте интернет.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AsyncBody(
      loading: _loading,
      error: _error,
      onRetry: _load,
      child: _versions.isEmpty
          ? const EmptyHint(
              'Своих версий пока нет',
              icon: Icons.library_music_outlined,
              hint: 'Свой текст и тональность песни создаются на сайте в «Студии». Готовые версии откроются здесь с аккордами.',
            )
          : SheetList(
              onRefresh: _load,
              children: [
                ListGroup(
                  children: [
                    for (final v in _versions)
                      ListRow(
                        leading: const IconTile(Icons.library_music_outlined, tone: Tone.violet),
                        title: v.title,
                        subtitle: [if (v.key != null) 'Тональность ${v.key}', if (v.updatedAt != null) 'изменена ${relativeTime(v.updatedAt!.toIso8601String())}'].join(' · '),
                        trailing: _busy == v.versionId ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2)) : null,
                        onTap: () => _open(v),
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}
