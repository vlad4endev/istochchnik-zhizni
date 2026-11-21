import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';
import 'sheet_frame.dart';

/// Меню кнопки «+» на главной: что добавить или изменить. Возвращает выбранный вид заметки.
Future<NoteKind?> showNoteMenu(BuildContext context, CoordinatorNotes notes) {
  return showPrayerSheet<NoteKind>(
    context,
    title: 'Что показать на главной?',
    subtitle: 'Увидят все участники церкви.',
    builder: (sheet) => ListGroup(
      dividerIndent: 70,
      children: [
        ListRow(
          leading: const IconTile(Icons.local_fire_department_rounded, tone: Tone.red),
          title: NoteKind.urgentPrayer.title,
          subtitle: notes.urgent == null ? 'Не задана — добавить' : 'Изменить или удалить',
          onTap: () => Navigator.pop(sheet, NoteKind.urgentPrayer),
        ),
        ListRow(
          leading: const IconTile(Icons.campaign_rounded, tone: Tone.amber),
          title: NoteKind.announcement.title,
          subtitle: notes.announcement == null ? 'Не задано — добавить' : 'Изменить или удалить',
          onTap: () => Navigator.pop(sheet, NoteKind.announcement),
        ),
      ],
    ),
  );
}
