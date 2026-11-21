import 'package:material_ui/material_ui.dart';

import '../../songbook/widgets/reader_palette.dart';
import '../models/studio_models.dart';

/// Строка песни без аккордов и служебных пометок — как её видит певец: «Бога благослови, о, душа моя».
String lyricExcerpt(String line, {int max = 48}) {
  final plain = line.replaceAll(RegExp(r'\[[^\]]*\]'), '').replaceAll(RegExp(r'\{[^}]*\}'), '').replaceAll(RegExp(r'\s+'), ' ').trim();
  return plain.length <= max ? plain : '${plain.substring(0, max).trimRight()}…';
}

/// Заметки музыканта к строкам и участкам песни, собранные одним списком под текстом.
List<({String where, String quote, String text})> notesRows(String content, MusicianNotes notes) {
  final lines = content.split('\n');
  String lineAt(int i) => i >= 0 && i < lines.length ? lyricExcerpt(lines[i]) : '';
  final rows = <({int order, String where, String quote, String text})>[
    for (final e in notes.lines.entries) (order: e.key, where: 'Строка ${e.key + 1}', quote: lineAt(e.key), text: e.value),
    for (final b in notes.blocks)
      (
        order: b.from,
        where: b.to > b.from ? 'Строки ${b.from + 1}–${b.to + 1}' : 'Строка ${b.from + 1}',
        quote: lineAt(b.from),
        text: b.text,
      ),
  ]..sort((a, b) => a.order.compareTo(b.order));
  return [for (final r in rows) (where: r.where, quote: r.quote, text: r.text)];
}

class MusicianNotesCard extends StatelessWidget {
  const MusicianNotesCard({super.key, required this.item, required this.palette});

  final SetlistItem item;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    final rows = notesRows(item.content, item.notes);
    if (rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Semantics(
        container: true,
        label: 'Заметки музыканта',
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(color: palette.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: palette.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Icon(Icons.edit_note_rounded, size: 20, color: palette.accent),
                const SizedBox(width: 8),
                Text('ЗАМЕТКИ МУЗЫКАНТА', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: palette.muted)),
              ]),
              for (final r in rows) ...[
                const SizedBox(height: 12),
                Text(r.where + (r.quote.isEmpty ? '' : ' · «${r.quote}»'), style: TextStyle(fontSize: 12.5, height: 1.35, color: palette.muted)),
                const SizedBox(height: 2),
                Text(r.text, style: TextStyle(fontSize: 16, height: 1.4, fontWeight: FontWeight.w600, color: palette.text)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
