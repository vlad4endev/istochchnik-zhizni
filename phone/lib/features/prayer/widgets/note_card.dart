import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';

enum _NoteAction { edit, delete }

/// Срочная нужда (красная, с пламенем) или объявление (янтарное) от координаторов.
/// Тем, кому можно управлять заметками, справа сверху доступно меню «⋯»: изменить или удалить.
class NoteCard extends StatefulWidget {
  const NoteCard({super.key, required this.kind, required this.note, this.onEdit, this.onDelete});

  final NoteKind kind;
  final CoordinatorNote note;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  State<NoteCard> createState() => _NoteCardState();
}

class _NoteCardState extends State<NoteCard> {
  static const _collapsedLines = 3;
  static const _longTextLength = 140;
  bool _expanded = false;

  bool get _urgent => widget.kind == NoteKind.urgentPrayer;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final dark = palette.isDark;
    final text = widget.note.text;
    final long = text.length > _longTextLength || '\n'.allMatches(text).length >= _collapsedLines;
    final manage = widget.onEdit != null || widget.onDelete != null;
    final gradient = _urgent
        ? const [Color(0xFFFFF1F2), Color(0xFFFFFFFF), Color(0xFFFFFBEB)]
        : const [Color(0xFFFFF8EC), Color(0xFFFEF0D6)];
    final border = _urgent ? const Color(0xFFFDA4AF) : const Color(0xFFF5D99A);
    final labelColor = _urgent ? const Color(0xFF9F1239) : const Color(0xFF9A6200);
    final textColor = _urgent ? const Color(0xFF4C0519) : const Color(0xFF3D2800);
    final linkColor = _urgent ? const Color(0xFF9F1239) : const Color(0xFFB87800);
    return Semantics(
      container: true,
      label: widget.kind.title,
      child: Container(
        decoration: BoxDecoration(
          gradient: dark ? null : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: gradient),
          color: dark ? (_urgent ? Tone.red : Tone.amber).bg(palette) : null,
          borderRadius: BorderRadius.circular(Radii.card),
          border: Border.all(color: dark ? border.withValues(alpha: 0.4) : border, width: _urgent ? 2 : 1),
        ),
        padding: const EdgeInsets.fromLTRB(16, 14, 6, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (_urgent) ...[
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: const Color(0xFFF43F5E).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(Radii.sm)),
                    child: Icon(Icons.local_fire_department_rounded, size: 20, color: dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C)),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Text(
                    _urgent ? widget.kind.title.toUpperCase() : widget.kind.title,
                    style: TextStyle(
                      fontSize: _urgent ? 11.5 : 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: _urgent ? 1.2 : 0.3,
                      color: dark ? palette.inkMuted : labelColor,
                    ),
                  ),
                ),
                if (manage)
                  PopupMenuButton<_NoteAction>(
                    tooltip: 'Действия: ${widget.kind.title.toLowerCase()}',
                    icon: Icon(Icons.more_horiz_rounded, color: dark ? palette.ink : labelColor),
                    constraints: const BoxConstraints(minWidth: 160),
                    onSelected: (a) => a == _NoteAction.edit ? widget.onEdit?.call() : widget.onDelete?.call(),
                    itemBuilder: (_) => [
                      if (widget.onEdit != null) const PopupMenuItem(value: _NoteAction.edit, height: 48, child: Text('Изменить')),
                      if (widget.onDelete != null)
                        const PopupMenuItem(
                          value: _NoteAction.delete,
                          height: 48,
                          child: Text('Удалить', style: TextStyle(color: ChurchColors.danger)),
                        ),
                    ],
                  )
                else
                  const SizedBox(height: 36),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(right: 10, top: 2),
              child: Text(
                text,
                maxLines: _expanded || !long ? null : _collapsedLines,
                overflow: _expanded || !long ? TextOverflow.visible : TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: _urgent ? 16 : 14.5,
                  height: 1.55,
                  fontWeight: FontWeight.w600,
                  color: dark ? palette.ink : textColor,
                ),
              ),
            ),
            if (long)
              TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 44),
                  padding: const EdgeInsets.only(right: 12),
                  foregroundColor: dark ? palette.accent : linkColor,
                ),
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(
                  _expanded ? 'Свернуть' : 'Читать полностью',
                  style: const TextStyle(fontWeight: FontWeight.w800, decoration: TextDecoration.underline),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
