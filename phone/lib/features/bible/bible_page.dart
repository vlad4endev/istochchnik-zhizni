import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class BiblePage extends StatefulWidget {
  const BiblePage({super.key});

  @override
  State<BiblePage> createState() => _BiblePageState();
}

class _BiblePageState extends State<BiblePage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _books = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final books = await ChurchApi(context.read<SessionController>()).books();
      if (!mounted) return;
      setState(() {
        _books = books;
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
    final nt = _books.where((b) => str(asMap(b)['testament']) == 'nt').toList();
    final ot = _books.where((b) => str(asMap(b)['testament']) == 'ot').toList();
    return ChurchPage(
      title: 'Библия',
      subtitle: 'Синодальный перевод',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _books.isEmpty
            ? const EmptyHint('Текст ещё не загружен на сервере', icon: Icons.menu_book_outlined)
            : SheetList(
                children: [
                  if (nt.isNotEmpty) ...[
                    const SectionLabel('Новый Завет'),
                    ListGroup(children: [for (final raw in nt) _book(context, asMap(raw), Tone.wine)]),
                  ],
                  if (ot.isNotEmpty) ...[
                    const SectionLabel('Ветхий Завет'),
                    ListGroup(children: [for (final raw in ot) _book(context, asMap(raw), Tone.amber)]),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _book(BuildContext context, Map<String, dynamic> book, Tone tone) {
    final short = str(book['short_name']).isEmpty ? str(book['name']) : str(book['short_name']);
    final chapters = asInt(book['chapters_count']);
    return ListRow(
      leading: Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: tone.bg(context.palette), borderRadius: BorderRadius.circular(Radii.md)),
        child: Text(
          short.isEmpty ? '?' : short.substring(0, short.length >= 2 ? 2 : 1),
          style: TextStyle(fontWeight: FontWeight.w800, color: tone.fg(context.palette)),
        ),
      ),
      title: short,
      subtitle: [str(book['name']) == short ? '' : str(book['name']), if (chapters > 0) 'глав: $chapters']
          .where((part) => part.isNotEmpty)
          .join(' · '),
      onTap: () => pushPage(
        context,
        ChapterPage(slug: str(book['slug']), title: short, chapters: chapters),
      ),
    );
  }
}

class ChapterPage extends StatefulWidget {
  const ChapterPage({super.key, required this.slug, required this.title, required this.chapters});
  final String slug;
  final String title;
  final int chapters;

  @override
  State<ChapterPage> createState() => _ChapterPageState();
}

class _ChapterPageState extends State<ChapterPage> {
  int _chapter = 1;
  bool _loading = true;
  String? _error;
  List<dynamic> _verses = const [];

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
      final data = await ChurchApi(context.read<SessionController>()).chapter(widget.slug, _chapter);
      if (!mounted) return;
      setState(() {
        _verses = asList(data['verses']);
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

  void _move(int delta) {
    final next = _chapter + delta;
    if (next < 1) return;
    if (widget.chapters > 0 && next > widget.chapters) return;
    setState(() => _chapter = next);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final canPrev = _chapter > 1;
    final canNext = !(widget.chapters > 0 && _chapter >= widget.chapters);
    return ChurchPage(
      title: '${widget.title} $_chapter',
      subtitle: widget.chapters > 0 ? 'Глава $_chapter из ${widget.chapters}' : 'Глава $_chapter',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          padding: EdgeInsets.fromLTRB(22, 22, 22, 24 + MediaQuery.paddingOf(context).bottom),
          children: [
            Text(
              'Глава $_chapter',
              style: ChurchType.serifTitle.copyWith(fontSize: 26, color: palette.ink),
            ),
            const SizedBox(height: 14),
            Text.rich(
              TextSpan(
                children: [
                  for (final raw in _verses) ...[
                    WidgetSpan(
                      alignment: PlaceholderAlignment.top,
                      child: Padding(
                        padding: const EdgeInsets.only(right: 4, top: 2),
                        child: Text(
                          '${asInt(asMap(raw)['verse'])}',
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: palette.accent),
                        ),
                      ),
                    ),
                    TextSpan(text: '${str(asMap(raw)['text'])} '),
                  ],
                ],
              ),
              style: TextStyle(fontSize: 17.5, height: 1.65, color: palette.ink),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: 'Назад',
                    icon: Icons.chevron_left_rounded,
                    onPressed: canPrev ? () => _move(-1) : null,
                  ),
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  child: PrimaryButton(
                    label: 'Далее',
                    icon: Icons.chevron_right_rounded,
                    height: 50,
                    onPressed: canNext ? () => _move(1) : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
