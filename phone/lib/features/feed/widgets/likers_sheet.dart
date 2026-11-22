import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../data/feed_source.dart';
import '../models/feed_models.dart';

/// «Кому понравилось» — список с подгрузкой.
Future<void> showLikersSheet(BuildContext context, {required FeedSource source, required String postId}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => LikersSheet(source: source, postId: postId),
  );
}

class LikersSheet extends StatefulWidget {
  const LikersSheet({super.key, required this.source, required this.postId});
  final FeedSource source;
  final String postId;

  @override
  State<LikersSheet> createState() => _LikersSheetState();
}

class _LikersSheetState extends State<LikersSheet> {
  final List<Liker> _items = [];
  String? _cursor;
  int _total = 0;
  bool _loading = true;
  bool _more = false;
  String? _error;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.hasClients && _scroll.position.pixels > _scroll.position.maxScrollExtent - 200) _loadMore();
    });
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.source.likers(widget.postId);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.likers);
        _cursor = page.nextCursor;
        _total = page.total;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Не удалось загрузить список. Проверьте интернет и попробуйте снова.';
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_more || _cursor == null) return;
    setState(() => _more = true);
    try {
      final page = await widget.source.likers(widget.postId, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.likers);
        _cursor = page.nextCursor;
      });
    } catch (_) {
      /* следующая прокрутка повторит */
    } finally {
      if (mounted) setState(() => _more = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final media = MediaQuery.of(context);
    return Container(
      constraints: BoxConstraints(maxHeight: media.size.height * 0.7),
      decoration: BoxDecoration(color: palette.sheet, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet))),
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: palette.outline, borderRadius: BorderRadius.circular(2)))),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
              child: Align(alignment: Alignment.centerLeft, child: Semantics(header: true, child: Text(_total > 0 ? 'Нравится · $_total' : 'Нравится', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink)))),
            ),
            Flexible(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          InfoBanner(_error!, error: true),
          const SizedBox(height: 10),
          SecondaryButton(key: const ValueKey('likers-retry'), label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _load),
        ]),
      );
    }
    if (_items.isEmpty) return const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: EmptyHint('Пока никому не понравилось', icon: Icons.favorite_border_rounded));
    return ListView.builder(
      controller: _scroll,
      shrinkWrap: true,
      padding: const EdgeInsets.only(bottom: 16),
      itemCount: _items.length + (_more ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _items.length) return const Padding(padding: EdgeInsets.all(14), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))));
        final l = _items[i];
        return ListRow(
          key: ValueKey('liker-${l.author.memberId}'),
          leading: ChurchAvatar(name: l.author.label, imageUrl: l.author.avatarUrl, size: 42),
          title: l.author.label,
          subtitle: l.likedAt == null ? null : relativeTime(l.likedAt!.toIso8601String()),
          chevron: false,
        );
      },
    );
  }
}
