import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../data/feed_source.dart';
import '../models/feed_models.dart';

/// Шторка комментариев: загружается один раз, лайки комментариев, удаление своих (и любых — автору записи),
/// ответ сразу появляется в списке. [onCountChanged] сообщает ленте, на сколько изменилось число.
Future<void> showCommentsSheet(
  BuildContext context, {
  required FeedSource source,
  required String postId,
  required int meId,
  required int postOwnerId,
  required ValueChanged<int> onCountChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => CommentsSheet(source: source, postId: postId, meId: meId, postOwnerId: postOwnerId, onCountChanged: onCountChanged),
  );
}

class CommentsSheet extends StatefulWidget {
  const CommentsSheet({super.key, required this.source, required this.postId, required this.meId, required this.postOwnerId, required this.onCountChanged});

  final FeedSource source;
  final String postId;
  final int meId;
  final int postOwnerId;
  final ValueChanged<int> onCountChanged;

  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  List<FeedComment>? _items;
  String? _error;
  bool _sending = false;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final list = await widget.source.comments(widget.postId);
      if (mounted) setState(() => _items = list);
    } catch (e) {
      if (mounted) setState(() => _error = 'Не удалось загрузить комментарии. Проверьте интернет и попробуйте снова.');
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final created = await widget.source.addComment(widget.postId, text);
      if (!mounted) return;
      _input.clear();
      widget.onCountChanged(1);
      if (created != null) {
        setState(() => _items = [...?_items, created]);
      } else {
        await _load();
      }
    } catch (e) {
      if (mounted) showMessage(context, e is FeedException ? e.message : 'Не удалось отправить. Попробуйте ещё раз.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(FeedComment c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Удалить комментарий?'),
        actions: [
          TextButton(key: const ValueKey('comment-delete-cancel'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
          TextButton(key: const ValueKey('comment-delete-ok'), onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await widget.source.deleteComment(widget.postId, c.id);
      if (!mounted) return;
      widget.onCountChanged(-1);
      setState(() => _items = [for (final x in _items ?? const <FeedComment>[]) if (x.id != c.id) x]);
    } catch (e) {
      if (mounted) showMessage(context, e is FeedException ? e.message : 'Не удалось удалить.');
    }
  }

  Future<void> _like(FeedComment c) async {
    if (!_busy.add(c.id)) return;
    final want = !c.likedByMe;
    void apply(bool liked, int count) => setState(() => _items = [for (final x in _items ?? const <FeedComment>[]) x.id == c.id ? x.copyWith(likedByMe: liked, likeCount: count) : x]);
    apply(want, (c.likeCount + (want ? 1 : -1)).clamp(0, 1 << 30));
    try {
      await widget.source.setCommentLike(widget.postId, c.id, liked: want);
    } catch (e) {
      if (mounted) {
        apply(c.likedByMe, c.likeCount);
        showMessage(context, e is FeedException ? e.message : 'Не получилось поставить отметку.');
      }
    } finally {
      _busy.remove(c.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final media = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.85),
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
                child: Align(alignment: Alignment.centerLeft, child: Semantics(header: true, child: Text('Комментарии', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink)))),
              ),
              Flexible(child: _body(palette)),
              Container(
                padding: EdgeInsets.fromLTRB(12, 8, 8, 10 + media.padding.bottom),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: palette.hairline))),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        key: const ValueKey('comment-field'),
                        controller: _input,
                        focusNode: _focus,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 1000,
                        buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                        textCapitalization: TextCapitalization.sentences,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(hintText: 'Напишите комментарий'),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filled(
                      key: const ValueKey('comment-send'),
                      tooltip: 'Отправить',
                      style: IconButton.styleFrom(backgroundColor: ChurchColors.wine, foregroundColor: Colors.white, minimumSize: const Size(46, 46)),
                      onPressed: _input.text.trim().isEmpty || _sending ? null : _send,
                      icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(ChurchPalette palette) {
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          InfoBanner(_error!, error: true),
          const SizedBox(height: 10),
          SecondaryButton(key: const ValueKey('comments-retry'), label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _load),
        ]),
      );
    }
    final items = _items;
    if (items == null) return const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()));
    if (items.isEmpty) return const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: EmptyHint('Комментариев пока нет', icon: Icons.chat_bubble_outline_rounded, hint: 'Начните разговор первым'));
    return ListView.builder(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
      itemCount: items.length,
      itemBuilder: (context, i) => _CommentRow(
        comment: items[i],
        canDelete: items[i].memberId == widget.meId || widget.postOwnerId == widget.meId,
        onLike: () => _like(items[i]),
        onDelete: () => _delete(items[i]),
      ),
    );
  }
}

class _CommentRow extends StatelessWidget {
  const _CommentRow({required this.comment, required this.canDelete, required this.onLike, required this.onDelete});
  final FeedComment comment;
  final bool canDelete;
  final VoidCallback onLike;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      key: ValueKey('comment-${comment.id}'),
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ChurchAvatar(name: comment.author.label, imageUrl: comment.author.avatarUrl, size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(TextSpan(children: [
                  TextSpan(text: '${comment.author.label}  ', style: TextStyle(fontWeight: FontWeight.w800, color: palette.ink)),
                  TextSpan(text: relativeTime(comment.createdAt?.toIso8601String()), style: TextStyle(fontSize: 12, color: palette.inkFaint)),
                ])),
                const SizedBox(height: 2),
                Text(comment.text, style: TextStyle(fontSize: 14.5, height: 1.35, color: palette.ink)),
                if (canDelete)
                  InkWell(
                    key: ValueKey('comment-del-${comment.id}'),
                    onTap: onDelete,
                    child: Padding(padding: const EdgeInsets.only(top: 6, bottom: 2), child: Text('Удалить', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted))),
                  ),
              ],
            ),
          ),
          Semantics(
            button: true,
            label: comment.likedByMe ? 'Убрать отметку «нравится», ${comment.likeCount}' : 'Нравится, ${comment.likeCount}',
            excludeSemantics: true,
            child: InkWell(
              key: ValueKey('comment-like-${comment.id}'),
              borderRadius: BorderRadius.circular(Radii.sm),
              onTap: onLike,
              child: SizedBox(
                width: 48,
                height: 48,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(comment.likedByMe ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 19, color: comment.likedByMe ? const Color(0xFFE0245E) : palette.inkMuted),
                    if (comment.likeCount > 0) Text('${comment.likeCount}', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
