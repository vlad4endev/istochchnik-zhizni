import 'package:material_ui/material_ui.dart';

import '../../../../core/json.dart';
import '../../../../ui/kit/kit.dart';
import '../logic/editor_logic.dart';
import '../models/editor_models.dart';
import 'block_style.dart';

enum BlockAction { edit, toggleHidden, delete }

/// Карточка блока: время начала, значок, название, ответственный, длительность, ручка для перетаскивания.
class BlockTile extends StatelessWidget {
  const BlockTile({
    super.key,
    required this.slot,
    required this.type,
    required this.responsible,
    required this.index,
    required this.onEdit,
    required this.onAction,
    this.reorderEnabled = true,
    this.showVisibilityAction = true,
  });

  final PlanSlot slot;
  final BlockType? type;
  final String? responsible;
  final int index;
  final VoidCallback onEdit;
  final ValueChanged<BlockAction> onAction;
  final bool reorderEnabled;

  /// В шаблоне «скрыть в публикации» не нужно.
  final bool showVisibilityAction;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final b = slot.block;
    if (b.isSeparator) return _separator(context, palette);
    final mark = str(b.content['block_mark_icon']).isNotEmpty ? str(b.content['block_mark_icon']) : (type?.code ?? 'custom');
    final (icon, tone) = blockLook(mark);
    final marker = str(b.content['block_mark']).trim();
    final subtitle = [
      '${b.minutes} мин',
      if (responsible != null && responsible!.isNotEmpty) responsible!,
      if (b.content['sermon_scripture'] is String && (b.content['sermon_scripture'] as String).trim().isNotEmpty) (b.content['sermon_scripture'] as String).trim(),
    ].join(' · ');
    return Semantics(
      container: true,
      label: '${slot.startsAt}, ${b.title}, ${b.minutes} мин',
      child: Material(
        color: palette.card,
        borderRadius: BorderRadius.circular(Radii.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.lg),
          onTap: onEdit,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 0, 8),
              child: Row(
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 46),
                    child: Text(slot.startsAt, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: palette.inkMuted, fontFeatures: const [FontFeature.tabularFigures()])),
                  ),
                  const SizedBox(width: 4),
                  IconTile(icon, tone: tone, size: 38),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                b.title.trim().isEmpty ? 'Без названия' : b.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.ink),
                              ),
                            ),
                            if (marker.isNotEmpty) ...[const SizedBox(width: 6), StatusPill(marker, tone: Tone.amber)],
                          ],
                        ),
                        if (subtitle.isNotEmpty)
                          Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: palette.inkMuted)),
                        if (b.isHidden)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Row(children: [
                              Icon(Icons.visibility_off_outlined, size: 14, color: palette.inkFaint),
                              const SizedBox(width: 4),
                              Flexible(child: Text('Скрыт в публикации', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: palette.inkFaint))),
                            ]),
                          ),
                      ],
                    ),
                  ),
                  _menu(palette),
                  if (reorderEnabled)
                    ReorderableDragStartListener(
                      index: index,
                      child: Semantics(
                        label: 'Перетащить блок',
                        child: SizedBox(width: 40, height: 48, child: Icon(Icons.drag_indicator_rounded, color: palette.inkFaint)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _separator(BuildContext context, ChurchPalette palette) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: onEdit,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
            child: Row(
              children: [
                Expanded(child: Divider(color: palette.outline)),
                const SizedBox(width: 10),
                Flexible(
                  flex: 3,
                  child: Text(slot.block.separatorLabel.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: palette.inkMuted)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Divider(color: palette.outline)),
                _menu(palette),
                if (reorderEnabled)
                  ReorderableDragStartListener(
                    index: index,
                    child: Semantics(label: 'Перетащить раздел', child: SizedBox(width: 40, height: 48, child: Icon(Icons.drag_indicator_rounded, color: palette.inkFaint))),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _menu(ChurchPalette palette) {
    return PopupMenuButton<BlockAction>(
      tooltip: 'Меню блока',
      icon: Icon(Icons.more_vert_rounded, color: palette.inkMuted),
      constraints: const BoxConstraints(minWidth: 44),
      onSelected: onAction,
      itemBuilder: (_) => [
        const PopupMenuItem(value: BlockAction.edit, child: Text('Редактировать')),
        if (!slot.block.isSeparator && showVisibilityAction) PopupMenuItem(value: BlockAction.toggleHidden, child: Text(slot.block.isHidden ? 'Показать в публикации' : 'Скрыть из публикации')),
        const PopupMenuItem(value: BlockAction.delete, child: Text('Удалить')),
      ],
    );
  }
}
