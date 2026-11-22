import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../models/feed_models.dart';

/// Кружки историй над лентой, как в Instagram: первым — «Ваша история» (с «+», чтобы добавить),
/// дальше чужие — непросмотренные с цветным кольцом, просмотренные — с серым.
class StoriesBar extends StatelessWidget {
  const StoriesBar({super.key, required this.me, required this.mine, required this.others, required this.loaded, required this.onOpen, required this.onAdd});

  /// Моё имя и фото — для кружка «Ваша история».
  final FeedAuthor me;
  final StoryGroup? mine;
  final List<StoryGroup> others;

  /// Истории уже пришли (пока нет — серые заглушки).
  final bool loaded;
  final ValueChanged<StoryGroup> onOpen;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    // Подпись растёт вместе с размером шрифта в системе — кружки не должны обрезаться.
    final label = MediaQuery.textScalerOf(context).scale(11.5) * 1.3;
    return SizedBox(
      height: 84 + label,
      child: ListView(
        key: const ValueKey('stories-bar'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Space.md),
        children: [
          StoryBubble(
            key: const ValueKey('story-mine'),
            name: 'Ваша история',
            avatarName: me.label,
            imageUrl: me.avatarUrl,
            ring: mine == null ? StoryRing.none : (mine!.allSeen ? StoryRing.seen : StoryRing.unseen),
            showAdd: true,
            onTap: () => mine == null ? onAdd() : onOpen(mine!),
            onAdd: onAdd,
          ),
          if (!loaded)
            for (var i = 0; i < 4; i++) const _Placeholder()
          else
            for (final g in others)
              StoryBubble(
                key: ValueKey('story-${g.author.memberId}'),
                name: g.author.label.split(' ').first,
                avatarName: g.author.label,
                imageUrl: g.author.avatarUrl,
                ring: g.allSeen ? StoryRing.seen : StoryRing.unseen,
                onTap: () => onOpen(g),
              ),
        ],
      ),
    );
  }
}

enum StoryRing { none, unseen, seen }

class StoryBubble extends StatelessWidget {
  const StoryBubble({super.key, required this.name, required this.avatarName, required this.ring, required this.onTap, this.imageUrl, this.showAdd = false, this.onAdd});

  final String name;
  final String avatarName;
  final String? imageUrl;
  final StoryRing ring;
  final bool showAdd;
  final VoidCallback onTap;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final gradient = ring == StoryRing.unseen ? const SweepGradient(colors: [ChurchColors.amber, Color(0xFFC0304F), Color(0xFF8A2742), ChurchColors.amber]) : null;
    return Semantics(
      button: true,
      label: showAdd ? (ring == StoryRing.none ? 'Добавить историю' : 'Ваша история') : 'История: $avatarName${ring == StoryRing.unseen ? ', новая' : ''}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: onTap,
        child: SizedBox(
          width: 78,
          child: Column(
            children: [
              const SizedBox(height: 6),
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    key: ValueKey('ring-${ring.name}'),
                    padding: const EdgeInsets.all(2.5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: gradient,
                      color: ring == StoryRing.seen ? palette.chevron.withValues(alpha: 0.55) : (ring == StoryRing.none ? Colors.transparent : null),
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(2.5),
                      decoration: BoxDecoration(shape: BoxShape.circle, color: palette.sheet),
                      child: ChurchAvatar(name: avatarName, imageUrl: imageUrl, size: 56),
                    ),
                  ),
                  if (showAdd)
                    Positioned(
                      right: -1,
                      bottom: -1,
                      child: GestureDetector(
                        key: const ValueKey('story-add'),
                        behavior: HitTestBehavior.opaque,
                        onTap: onAdd,
                        child: Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: ChurchColors.wine, border: Border.all(color: palette.sheet, width: 2)),
                          child: const Icon(Icons.add_rounded, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: ring == StoryRing.unseen ? FontWeight.w800 : FontWeight.w600, color: palette.ink)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      width: 78,
      child: Column(
        children: [
          const SizedBox(height: 11),
          Container(width: 60, height: 60, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.outline.withValues(alpha: 0.5))),
          const SizedBox(height: 10),
          Container(width: 44, height: 9, decoration: BoxDecoration(borderRadius: BorderRadius.circular(5), color: palette.outline.withValues(alpha: 0.5))),
        ],
      ),
    );
  }
}
