import 'package:material_ui/material_ui.dart';

import '../../core/church_api.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'models/bible_models.dart';

enum SavedTab { notes, bookmarks }

/// Заметки и закладки человека к Писанию. Нажатие открывает главу на нужном стихе.
/// Без загрузчика закладок показываются только заметки.
class BibleNotesPage extends StatefulWidget {
  const BibleNotesPage({
    super.key,
    required this.load,
    required this.onOpen,
    this.loadBookmarks,
    this.onOpenBookmark,
    this.deleteBookmark,
    this.initialTab = SavedTab.notes,
  });

  final Future<List<BibleNote>> Function() load;
  final void Function(BibleNote note) onOpen;
  final Future<List<BibleBookmark>> Function()? loadBookmarks;
  final void Function(BibleBookmark bookmark)? onOpenBookmark;
  final Future<void> Function(BibleBookmark bookmark)? deleteBookmark;
  final SavedTab initialTab;

  @override
  State<BibleNotesPage> createState() => _BibleNotesPageState();
}

class _BibleNotesPageState extends State<BibleNotesPage> {
  bool _loading = true;
  String? _error;
  List<BibleNote> _notes = const [];
  List<BibleBookmark> _bookmarks = const [];
  late SavedTab _tab = widget.loadBookmarks == null ? SavedTab.notes : widget.initialTab;

  bool get _hasBookmarks => widget.loadBookmarks != null;

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
      final notes = await widget.load();
      final bookmarks = _hasBookmarks ? await widget.loadBookmarks!() : const <BibleBookmark>[];
      if (!mounted) return;
      setState(() {
        _notes = [...notes]..sort((a, b) => (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
        _bookmarks = [...bookmarks]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
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

  Future<void> _remove(BibleBookmark bookmark) async {
    try {
      await widget.deleteBookmark?.call(bookmark);
      if (!mounted) return;
      setState(() => _bookmarks = [for (final b in _bookmarks) if (b.id != bookmark.id) b]);
      showMessage(context, 'Закладка удалена');
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось удалить закладку — проверьте интернет.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final bookmarksTab = _tab == SavedTab.bookmarks;
    return ChurchPage(
      title: _hasBookmarks ? 'Мои записи' : 'Мои заметки',
      subtitle: _hasBookmarks ? 'Заметки и закладки к Писанию' : 'К стихам Писания',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: Column(
          children: [
            if (_hasBookmarks)
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 0),
                child: SegmentedPills<SavedTab>(
                  segments: [
                    (SavedTab.notes, _notes.isEmpty ? 'Заметки' : 'Заметки · ${_notes.length}'),
                    (SavedTab.bookmarks, _bookmarks.isEmpty ? 'Закладки' : 'Закладки · ${_bookmarks.length}'),
                  ],
                  selected: _tab,
                  onChanged: (value) => setState(() => _tab = value),
                ),
              ),
            Expanded(
              child: bookmarksTab
                  ? (_bookmarks.isEmpty
                      ? const EmptyHint(
                          'Закладок пока нет',
                          icon: Icons.bookmark_border_rounded,
                          hint: 'В читалке нажмите на стих, затем «Закладка» — место сохранится здесь и в веб-версии.',
                        )
                      : SheetList(
                          onRefresh: _load,
                          children: [
                            ListGroup(
                              children: [
                                for (final b in _bookmarks)
                                  ListRow(
                                    leading: const IconTile(Icons.bookmark_rounded, tone: Tone.amber),
                                    title: b.reference,
                                    subtitle: b.bookName,
                                    trailing: IconButton(
                                      tooltip: 'Удалить закладку ${b.reference}',
                                      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                                      icon: Icon(Icons.delete_outline_rounded, color: palette.inkMuted),
                                      onPressed: widget.deleteBookmark == null ? null : () => _remove(b),
                                    ),
                                    onTap: () => widget.onOpenBookmark?.call(b),
                                  ),
                              ],
                            ),
                          ],
                        ))
                  : (_notes.isEmpty
                      ? const EmptyHint(
                          'Заметок пока нет',
                          icon: Icons.edit_note_rounded,
                          hint: 'В читалке нажмите на стих, затем «Заметка» — мысль сохранится здесь и в веб-версии.',
                        )
                      : SheetList(
                          onRefresh: _load,
                          children: [
                            ListGroup(
                              children: [
                                for (final note in _notes)
                                  ListRow(
                                    leading: const IconTile(Icons.sticky_note_2_outlined, tone: Tone.amber),
                                    title: note.reference,
                                    subtitle: note.body,
                                    subtitleMaxLines: 3,
                                    onTap: () => widget.onOpen(note),
                                  ),
                              ],
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 6),
                              child: Text('Заметки: ${_notes.length}', style: TextStyle(fontSize: 12.5, color: palette.inkMuted)),
                            ),
                          ],
                        )),
            ),
          ],
        ),
      ),
    );
  }
}
