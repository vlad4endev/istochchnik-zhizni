import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/song_search.dart';
import '../models/song.dart';

/// Текст с подсвеченными совпадениями поиска.
Widget highlighted(String text, List<MatchRange> marks, TextStyle base, Color markBg, {int maxLines = 1}) {
  if (marks.isEmpty) return Text(text, maxLines: maxLines, overflow: TextOverflow.ellipsis, style: base);
  final spans = <TextSpan>[];
  var cursor = 0;
  for (final m in marks) {
    final start = m.start.clamp(0, text.length);
    final end = m.end.clamp(start, text.length);
    if (start > cursor) spans.add(TextSpan(text: text.substring(cursor, start)));
    if (end > start) {
      spans.add(TextSpan(text: text.substring(start, end), style: TextStyle(backgroundColor: markBg, fontWeight: FontWeight.w800)));
    }
    cursor = end;
  }
  if (cursor < text.length) spans.add(TextSpan(text: text.substring(cursor)));
  return Text.rich(TextSpan(children: spans), maxLines: maxLines, overflow: TextOverflow.ellipsis, style: base);
}

/// Тональность в круглом бейдже.
class KeyPill extends StatelessWidget {
  const KeyPill(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      label: 'Тональность $label',
      excludeSemantics: true,
      child: Container(
        constraints: const BoxConstraints(minWidth: 34),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(99)),
        alignment: Alignment.center,
        child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: palette.accent, height: 1.1)),
      ),
    );
  }
}

/// Сердечко «в избранное» с зоной нажатия 44×44.
class FavoriteButton extends StatelessWidget {
  const FavoriteButton({super.key, required this.favorite, required this.onPressed});

  final bool favorite;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      label: favorite ? 'Убрать из избранного' : 'Добавить в избранное',
      excludeSemantics: true,
      child: InkResponse(
        onTap: onPressed,
        radius: 24,
        child: SizedBox(
          width: 44,
          height: 44,
          child: AnimatedSwitcher(
            duration: Motion.fast,
            transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
            child: Icon(
              favorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              key: ValueKey(favorite),
              size: 22,
              color: favorite ? const Color(0xFFD6385B) : palette.chevron,
            ),
          ),
        ),
      ),
    );
  }
}

/// Строка песни в списке: название, теги или цитата из текста, тональность, избранное.
class SongRow extends StatelessWidget {
  const SongRow({
    super.key,
    required this.song,
    required this.onTap,
    required this.onFavorite,
    this.titleMarks = const [],
    this.tagMarks = const [],
    this.snippet,
    this.showNumberColumn = false,
  });

  final Song song;
  final VoidCallback onTap;
  final VoidCallback onFavorite;
  final List<MatchRange> titleMarks;
  final List<MatchRange> tagMarks;
  final Snippet? snippet;

  /// Номер слева (при сортировке по номеру), а не в подписи.
  final bool showNumberColumn;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final markBg = palette.accent.withValues(alpha: 0.2);
    final tags = tagsLine(song);
    final numberPart = !showNumberColumn && song.number != null ? '№${song.number}' : '';
    final subtitle = [if (numberPart.isNotEmpty) numberPart, if (tags.isNotEmpty) tags].join(' · ');
    // Совпадения в тегах считаются внутри строки тегов — сдвигаем за номер.
    final tagShift = numberPart.isEmpty ? 0 : numberPart.length + 3;
    final subtitleMarks = [for (final m in tagMarks) MatchRange(m.start + tagShift, m.end + tagShift)];
    final label = [
      song.title,
      if (song.number != null) 'номер ${song.number}',
      if (song.keyLabel != null) 'тональность ${song.keyLabel}',
      if (song.favorite) 'в избранном',
    ].join(', ');

    return Row(
      children: [
        Expanded(
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: InkWell(
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 60),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
                  child: Row(
                    children: [
                      if (showNumberColumn) ...[
                        SizedBox(
                          width: 30,
                          child: Text(
                            song.number?.toString() ?? '·',
                            textAlign: TextAlign.right,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted),
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            highlighted(
                              song.title,
                              titleMarks,
                              ChurchType.title.copyWith(color: palette.ink, fontWeight: FontWeight.w700),
                              markBg,
                              maxLines: 2,
                            ),
                            if (snippet != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: highlighted(
                                  snippet!.text,
                                  snippet!.marks,
                                  TextStyle(fontSize: 13, height: 1.3, fontStyle: FontStyle.italic, color: palette.inkMuted),
                                  markBg,
                                ),
                              )
                            else if (subtitle.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: highlighted(subtitle, subtitleMarks, ChurchType.caption.copyWith(color: palette.inkMuted), markBg),
                              ),
                          ],
                        ),
                      ),
                      if (song.keyLabel != null) ...[
                        const SizedBox(width: 8),
                        ConstrainedBox(constraints: const BoxConstraints(maxWidth: 64), child: KeyPill(song.keyLabel!)),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 4),
          child: FavoriteButton(favorite: song.favorite, onPressed: onFavorite),
        ),
      ],
    );
  }
}
