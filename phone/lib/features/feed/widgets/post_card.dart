import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/video_page.dart';
import '../../../ui/widgets.dart';
import '../../chats/widgets/linkified_text.dart';
import '../../chats/widgets/media_gallery.dart' show GalleryViewerPage;
import '../logic/feed_text.dart';
import '../models/feed_models.dart';

/// Что можно сделать с записью из меню «⋯».
enum PostMenuAction { edit, delete }

/// Карточка записи в ленте: автор, подпись (с «ещё»), фото и видео каруселью, двойной тап — «нравится»,
/// лайк, комментарии, репост, список тех, кому понравилось.
class PostCard extends StatefulWidget {
  const PostCard({
    super.key,
    required this.post,
    required this.meId,
    required this.onLike,
    required this.onDoubleTapLike,
    required this.onComments,
    required this.onRepost,
    required this.onLikers,
    required this.onMenu,
    required this.onOpenUrl,
  });

  final FeedPost post;
  final int meId;
  final VoidCallback onLike;
  final VoidCallback onDoubleTapLike;
  final VoidCallback onComments;
  final VoidCallback onRepost;
  final VoidCallback onLikers;
  final ValueChanged<PostMenuAction> onMenu;
  final void Function(String url) onOpenUrl;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> with SingleTickerProviderStateMixin {
  bool _expanded = false;
  int _page = 0;
  late final AnimationController _heart = AnimationController(vsync: this, duration: const Duration(milliseconds: 650));

  @override
  void dispose() {
    _heart.dispose();
    super.dispose();
  }

  void _doubleTap() {
    HapticFeedback.lightImpact();
    _heart.forward(from: 0);
    widget.onDoubleTapLike();
  }

  void _openMedia(int index) {
    final media = widget.post.media;
    final item = media[index];
    if (item.isVideo) {
      pushPage(context, VideoPage(url: item.url, caption: widget.post.caption));
      return;
    }
    final photos = [for (final m in media) if (!m.isVideo) m.url];
    pushPage(context, GalleryViewerPage(urls: photos, initial: photos.indexOf(item.url)));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final post = widget.post;
    final isOwner = post.memberId == widget.meId;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _header(palette, isOwner),
          if (post.caption.isNotEmpty) _caption(palette),
          if (post.shared != null) _Embedded(shared: post.shared!, onOpenUrl: widget.onOpenUrl),
          if (post.hasMedia) _media(palette),
          _actions(palette),
          if (post.likeCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 2),
              child: InkWell(
                key: const ValueKey('post-likers'),
                onTap: widget.onLikers,
                child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(likesLabel(post.likeCount), style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: palette.ink))),
              ),
            ),
          if (post.commentCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
              child: InkWell(
                key: const ValueKey('post-open-comments'),
                onTap: widget.onComments,
                child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text('Смотреть все: ${commentsWord(post.commentCount)}', style: TextStyle(fontSize: 13.5, color: palette.inkMuted))),
              ),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _header(ChurchPalette palette, bool isOwner) {
    final post = widget.post;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 8),
      child: Row(
        children: [
          ChurchAvatar(name: post.author.label, imageUrl: post.author.avatarUrl, size: 40),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(post.author.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: ChurchType.title.copyWith(fontSize: 15, color: palette.ink)),
                Text(
                  [if (post.shared != null) 'поделился(-ась) записью', relativeTime(post.createdAt?.toIso8601String())].where((s) => s.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: palette.inkFaint),
                ),
              ],
            ),
          ),
          if (isOwner)
            PopupMenuButton<PostMenuAction>(
              key: const ValueKey('post-menu'),
              tooltip: 'Действия с записью',
              icon: Icon(Icons.more_horiz_rounded, color: palette.inkMuted),
              onSelected: widget.onMenu,
              itemBuilder: (_) => const [
                PopupMenuItem(value: PostMenuAction.edit, child: Text('Изменить подпись')),
                PopupMenuItem(value: PostMenuAction.delete, child: Text('Удалить запись', style: TextStyle(color: ChurchColors.danger))),
              ],
            ),
        ],
      ),
    );
  }

  Widget _caption(ChurchPalette palette) {
    final text = widget.post.caption;
    final collapse = !_expanded && captionNeedsCollapse(text);
    final style = ChurchType.body.copyWith(color: palette.ink, height: 1.4);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          collapse
              ? ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: (style.fontSize ?? 15) * (style.height ?? 1.4) * captionCollapsedLines + 2),
                  child: ClipRect(child: LinkifiedText(text: text, style: style, linkColor: palette.accent, onOpen: widget.onOpenUrl)),
                )
              : LinkifiedText(text: text, style: style, linkColor: palette.accent, onOpen: widget.onOpenUrl),
          if (collapse)
            InkWell(
              key: const ValueKey('post-expand'),
              onTap: () => setState(() => _expanded = true),
              child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text('ещё', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: palette.accent))),
            ),
        ],
      ),
    );
  }

  Widget _media(ChurchPalette palette) {
    final media = widget.post.media;
    return GestureDetector(
      key: const ValueKey('post-media'),
      onDoubleTap: _doubleTap,
      child: AspectRatio(
        aspectRatio: 4 / 5,
        child: Stack(
          fit: StackFit.expand,
          children: [
            PageView.builder(
              itemCount: media.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) => _MediaTile(item: media[i], onTap: () => _openMedia(i)),
            ),
            if (media.length > 1) ...[
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  key: const ValueKey('post-media-counter'),
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(12)),
                  child: Text('${_page + 1}/${media.length}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
              Positioned(
                bottom: 10,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < media.length; i++)
                      AnimatedContainer(
                        duration: Motion.fast,
                        margin: const EdgeInsets.symmetric(horizontal: 2.5),
                        width: i == _page ? 8 : 6,
                        height: i == _page ? 8 : 6,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: i == _page ? Colors.white : Colors.white54),
                      ),
                  ],
                ),
              ),
            ],
            // Сердце при двойном тапе.
            IgnorePointer(
              child: Center(
                child: AnimatedBuilder(
                  animation: _heart,
                  builder: (context, _) {
                    final t = _heart.value;
                    if (t == 0 || t == 1) return const SizedBox.shrink();
                    final scale = Curves.elasticOut.transform((t * 1.4).clamp(0.0, 1.0));
                    return Opacity(opacity: (1 - ((t - 0.6) / 0.4)).clamp(0.0, 1.0), child: Transform.scale(scale: scale, child: const Icon(Icons.favorite_rounded, size: 96, color: Colors.white, shadows: [Shadow(blurRadius: 18, color: Colors.black38)])));
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actions(ChurchPalette palette) {
    final post = widget.post;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 2, 8, 0),
      child: Row(
        children: [
          Flexible(
            child: _Action(
            key: const ValueKey('post-like'),
            icon: post.likedByMe ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            color: post.likedByMe ? const Color(0xFFE0245E) : palette.inkMuted,
            label: post.likedByMe ? 'Убрать отметку «нравится»' : 'Нравится',
            count: post.likeCount,
            onTap: widget.onLike,
          ),
          ),
          Flexible(child: _Action(key: const ValueKey('post-comment'), icon: Icons.chat_bubble_outline_rounded, color: palette.inkMuted, label: 'Комментарии', count: post.commentCount, onTap: widget.onComments)),
          Flexible(
            child: _Action(
            key: const ValueKey('post-repost'),
            icon: Icons.repeat_rounded,
            color: post.repostedByMe ? palette.accent : palette.inkMuted,
            label: post.repostedByMe ? 'Вы уже поделились' : 'Поделиться в ленте',
            count: post.repostCount,
            onTap: widget.onRepost,
          ),
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({super.key, required this.icon, required this.color, required this.label, required this.count, required this.onTap});
  final IconData icon;
  final Color color;
  final String label;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$label, $count',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.sm),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            // При крупном шрифте на узком экране содержимое сжимается, а не вылезает за край.
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedSwitcher(duration: Motion.fast, transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c), child: Icon(icon, key: ValueKey(icon), size: 24, color: color)),
                if (count > 0) ...[
                  const SizedBox(width: 6),
                  Text(compactCount(count), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.palette.inkMuted)),
                ],
              ],
            ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({required this.item, required this.onTap});
  final PostMedia item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (item.isVideo) {
      return GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3A0F1C), Color(0xFF8A2742)])),
          child: Center(
            child: Semantics(
              button: true,
              label: 'Смотреть видео',
              child: Container(width: 64, height: 64, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.22)), child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 40)),
            ),
          ),
        ),
      );
    }
    return GestureDetector(
      onTap: onTap,
      child: Image.network(
        item.url,
        fit: BoxFit.cover,
        cacheWidth: 1080,
        loadingBuilder: (context, child, progress) => progress == null ? child : Container(color: palette.accentSoft),
        errorBuilder: (_, _, _) => Container(color: palette.accentSoft, child: Icon(Icons.broken_image_outlined, color: palette.inkFaint, size: 40)),
      ),
    );
  }
}

/// Запись, которой поделились: рамка с автором и текстом внутри нового поста.
class _Embedded extends StatelessWidget {
  const _Embedded({required this.shared, required this.onOpenUrl});
  final EmbeddedPost shared;
  final void Function(String url) onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final first = shared.media.isEmpty ? null : shared.media.first;
    return Container(
      key: const ValueKey('post-embedded'),
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(Radii.lg), border: Border.all(color: palette.outline)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
            child: Row(
              children: [
                ChurchAvatar(name: shared.author.label, imageUrl: shared.author.avatarUrl, size: 28),
                const SizedBox(width: 8),
                Expanded(child: Text(shared.author.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: palette.ink))),
                Text(relativeTime(shared.createdAt?.toIso8601String()), style: TextStyle(fontSize: 11.5, color: palette.inkFaint)),
              ],
            ),
          ),
          if (shared.caption.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              child: LinkifiedText(text: shared.caption, style: TextStyle(fontSize: 14, height: 1.35, color: palette.ink), linkColor: palette.accent, onOpen: onOpenUrl),
            ),
          if (first != null && !first.isVideo)
            AspectRatio(aspectRatio: 16 / 10, child: Image.network(first.url, fit: BoxFit.cover, cacheWidth: 720, errorBuilder: (_, _, _) => Container(color: palette.accentSoft))),
          if (first != null && first.isVideo)
            Container(height: 120, color: palette.accentSoft, child: Center(child: Icon(Icons.play_circle_outline_rounded, size: 44, color: palette.accent))),
        ],
      ),
    );
  }
}
