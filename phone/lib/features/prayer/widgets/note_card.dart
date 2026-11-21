import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';

/// Срочная нужда (красная, с пламенем) или объявление (янтарное) от координаторов.
/// Кнопки «Изменить» и «Удалить» видят только те, кому можно управлять заметками.
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
  static const _collapsedLines = 4;
  static const _longTextLength = 160;
  bool _expanded = false;

  bool get _urgent => widget.kind == NoteKind.urgentPrayer;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = _urgent ? Tone.red : Tone.amber;
    final text = widget.note.text;
    final long = text.length > _longTextLength || '\n'.allMatches(text).length >= _collapsedLines;
    final manage = widget.onEdit != null || widget.onDelete != null;
    return Semantics(
      container: true,
      label: widget.kind.title,
      child: Container(
        decoration: BoxDecoration(
          color: tone.bg(palette),
          borderRadius: BorderRadius.circular(Radii.card),
          border: Border.all(color: tone.fg(palette).withValues(alpha: _urgent ? 0.55 : 0.35), width: _urgent ? 1.6 : 1),
        ),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconTile(
                  _urgent ? Icons.local_fire_department_rounded : Icons.campaign_rounded,
                  tone: tone,
                  size: 38,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.kind.title.toUpperCase(),
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.1,
                      color: tone.text(palette),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              text,
              maxLines: _expanded || !long ? null : _collapsedLines,
              overflow: _expanded || !long ? TextOverflow.visible : TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15.5,
                height: 1.45,
                fontWeight: _urgent ? FontWeight.w700 : FontWeight.w600,
                color: palette.ink,
              ),
            ),
            if (long || manage)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(
                  spacing: 4,
                  children: [
                    if (long)
                      TextButton(
                        style: TextButton.styleFrom(
                          minimumSize: const Size(48, 44),
                          foregroundColor: tone.text(palette),
                        ),
                        onPressed: () => setState(() => _expanded = !_expanded),
                        child: Text(_expanded ? 'Свернуть' : 'Читать полностью'),
                      ),
                    if (widget.onEdit != null)
                      TextButton.icon(
                        style: TextButton.styleFrom(minimumSize: const Size(48, 44), foregroundColor: palette.ink),
                        onPressed: widget.onEdit,
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        label: const Text('Изменить'),
                      ),
                    if (widget.onDelete != null)
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          minimumSize: const Size(48, 44),
                          foregroundColor: ChurchColors.danger,
                        ),
                        onPressed: widget.onDelete,
                        icon: const Icon(Icons.delete_outline_rounded, size: 18),
                        label: const Text('Удалить'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
