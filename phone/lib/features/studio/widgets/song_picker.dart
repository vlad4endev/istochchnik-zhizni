import 'package:material_ui/material_ui.dart';

import '../../../core/church_api.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart' show ErrorView, LoadingView, showMessage;
import '../../songbook/logic/song_search.dart';
import '../../songbook/models/song.dart';
import '../models/studio_models.dart';

/// Выбор песен в сетлист. Лист остаётся открытым, чтобы добавить несколько песен подряд.
/// Если у человека есть своя версия песни, перед добавлением спрашиваем, какую брать.
Future<void> showSongPicker(
  BuildContext context, {
  required Future<List<Song>> Function() loadSongs,
  required Future<Map<int, MyVersion>> Function() loadVersions,
  required Future<void> Function(Song song, MyVersion? version) onAdd,
  required Set<int> alreadyIn,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PickerSheet(
      loadSongs: loadSongs,
      loadVersions: loadVersions,
      onAdd: onAdd,
      alreadyIn: alreadyIn,
    ),
  );
}

class _PickerSheet extends StatefulWidget {
  const _PickerSheet({
    required this.loadSongs,
    required this.loadVersions,
    required this.onAdd,
    required this.alreadyIn,
  });

  final Future<List<Song>> Function() loadSongs;
  final Future<Map<int, MyVersion>> Function() loadVersions;
  final Future<void> Function(Song song, MyVersion? version) onAdd;
  final Set<int> alreadyIn;

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  bool _loading = true;
  String? _error;
  String _query = '';
  SongIndex? _index;
  List<Song> _songs = const [];
  Map<int, MyVersion> _versions = const {};
  late final Set<int> _added = {...widget.alreadyIn};
  int? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final songs = await widget.loadSongs();
      Map<int, MyVersion> versions = const {};
      try {
        versions = await widget.loadVersions();
      } catch (_) {
        /* без версий можно добавить общую */
      }
      if (!mounted) return;
      setState(() {
        _songs = [...songs]
          ..sort(
            (a, b) => foldForSearch(a.title).compareTo(foldForSearch(b.title)),
          );
        _index = SongIndex(_songs);
        _versions = versions;
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

  Future<void> _tap(Song song) async {
    if (_busy != null) return;
    MyVersion? version = _versions[song.id];
    if (version != null) {
      // Своя версия есть — спрашиваем, чтобы не подменить песню молча.
      final choice = await showModalBottomSheet<_Choice>(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (context) => _VersionChoice(song: song, version: version!),
      );
      if (choice == null) return;
      if (choice == _Choice.common) version = null;
    }
    setState(() => _busy = song.id);
    try {
      await widget.onAdd(song, version);
      if (mounted) setState(() => _added.add(song.id));
    } catch (error) {
      if (mounted) showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final height = MediaQuery.sizeOf(context).height;
    final shown = _query.trim().isEmpty
        ? _songs
        : [
            for (final h in _index?.search(_query) ?? const <SearchHit>[])
              h.song,
          ];
    return Container(
      constraints: BoxConstraints(maxHeight: height * 0.92),
      decoration: BoxDecoration(
        color: palette.sheet,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(Radii.sheet),
        ),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Material(
        type: MaterialType.transparency,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: palette.outline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          'Добавить песню',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: palette.ink,
                          ),
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text(
                        'Готово',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  enableSuggestions: false,
                  style: TextStyle(fontSize: 15.5, color: palette.ink),
                  decoration: InputDecoration(
                    hintText: 'Название, текст или номер',
                    prefixIcon: Icon(
                      Icons.search_rounded,
                      color: palette.inkMuted,
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(Radii.lg),
                      borderSide: BorderSide(color: palette.hairline),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(Radii.lg),
                      borderSide: BorderSide(color: palette.hairline),
                    ),
                  ),
                ),
              ),
              Flexible(
                child: _loading
                    ? const Padding(
                        padding: EdgeInsets.all(40),
                        child: LoadingView(),
                      )
                    : _error != null
                    ? ErrorView(message: _error!, onRetry: _load)
                    : shown.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(28),
                        child: Text(
                          _query.isEmpty
                              ? 'В песеннике нет песен.'
                              : 'Ничего не найдено.',
                          style: TextStyle(color: palette.inkMuted),
                        ),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                        itemCount: shown.length,
                        itemBuilder: (context, i) {
                          final s = shown[i];
                          final added = _added.contains(s.id);
                          final mine = _versions.containsKey(s.id);
                          return Semantics(
                            button: true,
                            label:
                                '${s.title}${added ? ', уже в сетлисте' : ''}${mine ? ', есть ваша версия' : ''}',
                            excludeSemantics: true,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(Radii.md),
                              onTap: () => _tap(s),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: 60,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              s.title,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontSize: 15.5,
                                                fontWeight: FontWeight.w700,
                                                color: palette.ink,
                                              ),
                                            ),
                                            if (mine ||
                                                (s.key ?? '').isNotEmpty)
                                              Text(
                                                [
                                                  if ((s.key ?? '').isNotEmpty)
                                                    s.key!,
                                                  if (mine) 'есть ваша версия',
                                                ].join(' · '),
                                                style: ChurchType.caption
                                                    .copyWith(
                                                      color: palette.inkMuted,
                                                    ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      if (_busy == s.id)
                                        const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.4,
                                          ),
                                        )
                                      else
                                        Icon(
                                          added
                                              ? Icons.check_circle_rounded
                                              : Icons
                                                    .add_circle_outline_rounded,
                                          color: added
                                              ? palette.accent
                                              : palette.chevron,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _Choice { mine, common }

class _VersionChoice extends StatelessWidget {
  const _VersionChoice({required this.song, required this.version});
  final Song song;
  final MyVersion version;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: palette.sheet,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(Radii.sheet),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        16 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              song.title,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: palette.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'У вас есть своя версия этой песни. Какую добавить в сетлист?',
              style: TextStyle(
                fontSize: 14,
                height: 1.4,
                color: palette.inkMuted,
              ),
            ),
            const SizedBox(height: 14),
            PrimaryButton(
              label: version.key == null
                  ? 'Мою версию'
                  : 'Мою версию · ${version.key}',
              height: 50,
              onPressed: () => Navigator.pop(context, _Choice.mine),
            ),
            const SizedBox(height: 10),
            SecondaryButton(
              label:
                  'Общую из песенника${(song.key ?? '').isEmpty ? '' : ' · ${song.key}'}',
              onPressed: () => Navigator.pop(context, _Choice.common),
            ),
          ],
        ),
      ),
    );
  }
}
