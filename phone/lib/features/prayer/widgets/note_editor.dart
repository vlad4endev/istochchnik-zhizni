import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../models/prayer_models.dart';
import '../prayer_controllers.dart';
import 'sheet_frame.dart';

/// Лимит сервера на текст заметки.
const noteMaxLength = 8000;

/// Создать или изменить срочную нужду / объявление. Возвращает true, если что-то сохранено или удалено.
Future<bool> showNoteEditor(BuildContext context, NotesController controller, NoteKind kind, DateTime today) async {
  CoordinatorNote? existing;
  try {
    existing = await controller.noteForEdit(kind);
  } catch (_) {
    // Нет связи с «manage»: правим то, что видно сейчас.
    existing = controller.notes.of(kind);
  }
  if (!context.mounted) return false;
  final changed = await showPrayerSheet<bool>(
    context,
    title: kind.title,
    subtitle: kind == NoteKind.urgentPrayer
        ? 'Покажем всем участникам в «Молитве» и на главной.'
        : 'Покажем всем участникам на главной.',
    builder: (_) => NoteEditor(controller: controller, kind: kind, existing: existing, today: today),
  );
  return changed ?? false;
}

class NoteEditor extends StatefulWidget {
  const NoteEditor({
    super.key,
    required this.controller,
    required this.kind,
    required this.existing,
    required this.today,
  });

  final NotesController controller;
  final NoteKind kind;
  final CoordinatorNote? existing;
  final DateTime today;

  @override
  State<NoteEditor> createState() => _NoteEditorState();
}

class _NoteEditorState extends State<NoteEditor> {
  late final TextEditingController _text = TextEditingController(text: widget.existing?.text ?? '');
  late NoteDuration _duration = widget.existing?.duration ?? NoteDuration.day;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = actionError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final canSave = _text.text.trim().isNotEmpty && !_busy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LabeledField(
          label: 'Текст',
          controller: _text,
          hint: widget.kind == NoteKind.urgentPrayer ? 'О чём срочно помолиться…' : 'Что нужно знать участникам…',
          minLines: 4,
          maxLines: 8,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          keyboardType: TextInputType.multiline,
          onChanged: (_) => setState(() {}),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${_text.text.characters.length} / $noteMaxLength',
              style: TextStyle(fontSize: 12, color: palette.inkFaint),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text('Показывать', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted)),
        const SizedBox(height: 8),
        RadioGroup<NoteDuration>(
          groupValue: _duration,
          onChanged: (value) {
            if (value != null && !_busy) setState(() => _duration = value);
          },
          child: Column(
            children: [
              for (final option in NoteDuration.values)
                RadioListTile<NoteDuration>(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  value: option,
                  title: Text(option.label, style: TextStyle(color: palette.ink)),
                ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          InfoBanner(_error!, error: true),
        ],
        const SizedBox(height: 12),
        PrimaryButton(
          label: 'Опубликовать',
          icon: Icons.check_rounded,
          busy: _busy,
          onPressed: canSave
              ? () => _run(() => widget.controller.save(
                    widget.kind,
                    _text.text.trim().characters.take(noteMaxLength).toString(),
                    _duration,
                    now: widget.today,
                  ))
              : null,
        ),
        if (widget.existing != null) ...[
          const SizedBox(height: 8),
          SecondaryButton(
            label: 'Удалить',
            icon: Icons.delete_outline_rounded,
            onPressed: _busy ? null : () => _confirmDelete(),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmDelete() async {
    final ok = await confirmDelete(context, widget.kind);
    if (ok) await _run(() => widget.controller.remove(widget.kind, widget.today));
  }
}

/// Подтверждение удаления заметки.
Future<bool> confirmDelete(BuildContext context, NoteKind kind) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialog) => AlertDialog(
      title: Text(kind == NoteKind.urgentPrayer ? 'Удалить срочную нужду?' : 'Удалить объявление?'),
      content: const Text('Заметка пропадёт у всех участников.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
        TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
      ],
    ),
  );
  return ok == true;
}

/// Удалить заметку со страницы (подтверждение, ошибка в снекбаре).
Future<void> deleteNoteWithConfirm(
  BuildContext context,
  NotesController controller,
  NoteKind kind,
  DateTime forDate,
) async {
  if (!await confirmDelete(context, kind)) return;
  try {
    await controller.remove(kind, forDate);
  } catch (error) {
    if (context.mounted) showMessage(context, 'Не удалось удалить: ${actionError(error)}');
  }
}
