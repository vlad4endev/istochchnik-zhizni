import 'package:material_ui/material_ui.dart';

import '../../../core/plural.dart';
import '../../../ui/kit/kit.dart';
import '../logic/song_search.dart';
import '../songbook_controller.dart';
import 'toggle_chip.dart';

/// Окно «Фильтры»: теги, тональность, темп, порядок. Список позади обновляется сразу.
Future<void> showSongFilters(BuildContext context, SongbookController controller) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => ListenableBuilder(
      listenable: controller,
      builder: (context, _) => _FilterSheet(controller: controller),
    ),
  );
}

class _FilterSheet extends StatelessWidget {
  const _FilterSheet({required this.controller});
  final SongbookController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final palette = context.palette;
    final f = c.filters;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.9;
    final shown = c.shownCount;

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 2, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text('Фильтры', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: palette.ink)),
                  ),
                ),
                if (!f.isEmpty)
                  TextButton(onPressed: c.clearFilters, child: const Text('Сбросить')),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (c.tags.isNotEmpty) ...[
                    const _Heading('Теги'),
                    _ChipWrap(children: [
                      for (final t in c.tags)
                        ToggleChip(label: t.name, count: t.count, selected: f.tags.contains(t.name), onTap: () => c.toggleTag(t.name)),
                    ]),
                  ],
                  if (c.keys.isNotEmpty) ...[
                    const _Heading('Тональность'),
                    _ChipWrap(children: [
                      for (final k in c.keys)
                        ToggleChip(
                          label: k.name,
                          count: k.count,
                          selected: f.keys.contains(k.name),
                          onTap: () {
                            final next = {...f.keys};
                            if (!next.remove(k.name)) next.add(k.name);
                            c.setFilters(f.copyWith(keys: next));
                          },
                        ),
                    ]),
                  ],
                  if (c.hasTempo) ...[
                    const _Heading('Темп'),
                    _ChipWrap(children: [
                      for (final band in TempoBand.values)
                        ToggleChip(
                          label: '${band.label} · ${band.range}',
                          selected: f.tempo == band,
                          onTap: () => c.setFilters(f.copyWith(tempo: f.tempo == band ? null : band)),
                        ),
                    ]),
                  ],
                  const _Heading('Порядок'),
                  SegmentedPills<SongSort>(
                    segments: const [(SongSort.alphabetical, 'По алфавиту'), (SongSort.number, 'По номеру')],
                    selected: c.sort,
                    onChanged: c.setSort,
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
              child: PrimaryButton(
                label: shown == 0 ? 'Ничего не найдено' : 'Показать ${countSongs(shown)}',
                onPressed: shown == 0 ? null : () => Navigator.pop(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 14, bottom: 4),
        child: Semantics(header: true, child: Text(text.toUpperCase(), style: ChurchType.sectionLabel.copyWith(color: context.palette.accent))),
      );
}

class _ChipWrap extends StatelessWidget {
  const _ChipWrap({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 8, runSpacing: 0, children: children);
}
