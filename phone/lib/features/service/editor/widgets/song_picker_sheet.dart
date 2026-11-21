import 'package:material_ui/material_ui.dart';

import '../../../../ui/kit/kit.dart';
import '../../../../ui/widgets.dart' show LoadingView;
import '../../../songbook/logic/song_search.dart' show foldForSearch;
import '../data/editor_source.dart';

/// Результат выбора: песня или «снять песню».
class SongPick {
  const SongPick(this.song);
  final SongChoice? song;
}

/// Выбор песни из каталога: поиск по названию, номеру и тональности.
Future<SongPick?> showSongPicker(BuildContext context, {required List<SongChoice>? songs, int? currentId}) {
  return showModalBottomSheet<SongPick>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SongSheet(songs: songs, currentId: currentId),
  );
}

class _SongSheet extends StatefulWidget {
  const _SongSheet({required this.songs, required this.currentId});

  final List<SongChoice>? songs;
  final int? currentId;

  @override
  State<_SongSheet> createState() => _SongSheetState();
}

class _SongSheetState extends State<_SongSheet> {
  String _query = '';

  List<SongChoice> get _filtered {
    final all = widget.songs ?? const <SongChoice>[];
    final q = foldForSearch(_query).trim();
    if (q.isEmpty) return all;
    return [
      for (final s in all)
        if (foldForSearch(s.title).contains(q) || '${s.number ?? ''}'.contains(q) || foldForSearch(s.key ?? '') == q) s,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final shown = _filtered;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
      decoration: BoxDecoration(color: palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Material(
        type: MaterialType.transparency,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: palette.outline, borderRadius: BorderRadius.circular(2))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
                child: Row(
                  children: [
                    Expanded(child: Semantics(header: true, child: Text('Выбрать песню', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink)))),
                    IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: Icon(Icons.close_rounded, color: palette.inkMuted)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: TextField(
                  key: const ValueKey('song-search'),
                  autofocus: true,
                  onChanged: (v) => setState(() => _query = v),
                  enableSuggestions: false,
                  style: TextStyle(fontSize: 15.5, color: palette.ink),
                  decoration: InputDecoration(
                    hintText: 'Название, номер или тональность',
                    prefixIcon: Icon(Icons.search_rounded, color: palette.inkMuted),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
                  ),
                ),
              ),
              if (widget.currentId != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: ChurchColors.danger),
                    onPressed: () => Navigator.pop(context, const SongPick(null)),
                    icon: const Icon(Icons.music_off_outlined, size: 20),
                    label: const Text('Песня не назначена', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              Flexible(
                child: widget.songs == null
                    ? const Padding(padding: EdgeInsets.all(40), child: LoadingView())
                    : shown.isEmpty
                        ? Padding(padding: const EdgeInsets.all(24), child: Text(widget.songs!.isEmpty ? 'Каталог песен пуст или недоступен.' : 'Ничего не нашли.', textAlign: TextAlign.center, style: TextStyle(color: palette.inkMuted)))
                        : ListView.builder(
                            shrinkWrap: true,
                            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                            itemCount: shown.length,
                            itemBuilder: (context, i) {
                              final s = shown[i];
                              return ListTile(
                                key: ValueKey('song-${s.id}'),
                                minTileHeight: 56,
                                selected: s.id == widget.currentId,
                                leading: Icon(Icons.music_note_rounded, color: palette.accent),
                                title: Text(s.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                                subtitle: Text([if (s.number != null) '№ ${s.number}', if (s.key != null) s.key!].join(' · ')),
                                onTap: () => Navigator.pop(context, SongPick(s)),
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
