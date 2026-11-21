import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/plural.dart';
import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';
import 'sheet_frame.dart';

String _visitTime(DateTime? at) => at == null ? '' : 'сегодня в ${DateFormat('HH:mm').format(at)}';

String viewersCaption(int count) =>
    'Сегодня раздел открыли $count ${pluralRu(count, 'человек', 'человека', 'человек')}';

/// Кто сегодня открывал «Молитву»: список для пастора и администратора.
Future<void> showViewersSheet(BuildContext context, ViewersToday viewers) {
  return showPrayerSheet<void>(
    context,
    title: viewersCaption(viewers.count),
    subtitle: 'Считается один раз в сутки на человека.',
    builder: (_) => ViewersList(viewers: viewers),
  );
}

class ViewersList extends StatefulWidget {
  const ViewersList({super.key, required this.viewers});
  final ViewersToday viewers;

  @override
  State<ViewersList> createState() => _ViewersListState();
}

class _ViewersListState extends State<ViewersList> {
  static const _searchFrom = 8;
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final all = widget.viewers.viewers;
    final needle = _query.text.trim().toLowerCase();
    final shown = [
      for (final v in all)
        if (needle.isEmpty || v.person.displayName.toLowerCase().contains(needle)) v,
    ];
    if (all.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(
          'Пока никто не заходил.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14.5, color: palette.inkMuted),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (all.length >= _searchFrom) ...[
          ChurchSearchField(controller: _query, hint: 'Найти по имени', onChanged: (_) => setState(() {})),
          const SizedBox(height: 8),
        ],
        if (shown.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Text(
              'Никого не нашли.',
              textAlign: TextAlign.center,
              style: TextStyle(color: palette.inkMuted),
            ),
          ),
        for (final v in shown)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                ChurchAvatar(name: v.person.displayName, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    v.person.displayName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: palette.ink),
                  ),
                ),
                const SizedBox(width: 8),
                Text(_visitTime(v.firstSeen), style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
              ],
            ),
          ),
      ],
    );
  }
}
