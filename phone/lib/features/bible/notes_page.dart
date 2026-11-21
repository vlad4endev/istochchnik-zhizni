import 'package:material_ui/material_ui.dart';

import '../../core/church_api.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'models/bible_models.dart';

/// Все заметки человека к Писанию. Нажатие открывает главу на нужном стихе.
class BibleNotesPage extends StatefulWidget {
  const BibleNotesPage({super.key, required this.load, required this.onOpen});

  final Future<List<BibleNote>> Function() load;
  final void Function(BibleNote note) onOpen;

  @override
  State<BibleNotesPage> createState() => _BibleNotesPageState();
}

class _BibleNotesPageState extends State<BibleNotesPage> {
  bool _loading = true;
  String? _error;
  List<BibleNote> _notes = const [];

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
      final list = await widget.load();
      if (!mounted) return;
      setState(() {
        _notes = [...list]..sort((a, b) => (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
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
      title: 'Мои заметки',
      subtitle: 'К стихам Писания',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _notes.isEmpty
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
                    child: Text(
                      'Заметки: ${_notes.length}',
                      style: TextStyle(fontSize: 12.5, color: palette.inkMuted),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
