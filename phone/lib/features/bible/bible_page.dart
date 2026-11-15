import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Библия')),
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListView(
          children: [
            const ListTile(title: Text('Новый Завет')),
            for (final raw in nt) _book(context, asMap(raw)),
            const ListTile(title: Text('Ветхий Завет')),
            for (final raw in ot) _book(context, asMap(raw)),
            if (_books.isEmpty) const EmptyHint('Текст ещё не загружен на сервере'),
          ],
        ),
      ),
    );
  }

  Widget _book(BuildContext context, Map<String, dynamic> book) {
    return ListTile(
      title: Text(str(book['short_name']).isEmpty ? str(book['name']) : str(book['short_name'])),
      subtitle: Text(str(book['name'])),
      onTap: () => pushPage(
        context,
        ChapterPage(slug: str(book['slug']), title: str(book['short_name']), chapters: asInt(book['chapters_count'])),
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
    return Scaffold(
      appBar: AppBar(title: Text('${widget.title} $_chapter')),
      body: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(onPressed: _chapter <= 1 ? null : () => _move(-1), icon: const Icon(Icons.chevron_left)),
              Text('Глава $_chapter'),
              IconButton(
                onPressed: widget.chapters > 0 && _chapter >= widget.chapters ? null : () => _move(1),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final raw in _verses)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: '${asInt(asMap(raw)['verse'])} ',
                              style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w700),
                            ),
                            TextSpan(text: str(asMap(raw)['text'])),
                          ],
                        ),
                        style: const TextStyle(fontSize: 17, height: 1.45),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
