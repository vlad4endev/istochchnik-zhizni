import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../prayer/widgets/sheet_frame.dart';
import '../models/home_models.dart';

/// Описание мероприятия: афиша, время, текст и переход в календарь мероприятий.
Future<void> showEventSheet(BuildContext context, HomeEvent event, {required String Function(String) resolveUrl, required VoidCallback onCalendar}) {
  return showPrayerSheet<void>(
    context,
    title: event.title,
    subtitle: event.whenLabel,
    builder: (sheet) {
      final palette = sheet.palette;
      final poster = event.posterUrl == null ? '' : resolveUrl(event.posterUrl!);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (poster.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.lg),
              child: SizedBox(
                height: 200,
                child: Image.network(
                  poster,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(color: palette.card, alignment: Alignment.center, child: Icon(Icons.image_not_supported_outlined, color: palette.inkFaint)),
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          Text(event.description, style: TextStyle(fontSize: 14.5, height: 1.5, fontWeight: FontWeight.w500, color: palette.ink)),
          const SizedBox(height: 18),
          if (!event.isPlaceholder)
            PrimaryButton(
              label: 'Календарь мероприятий',
              icon: Icons.calendar_month_outlined,
              onPressed: () {
                Navigator.pop(sheet);
                onCalendar();
              },
            ),
          if (!event.isPlaceholder) const SizedBox(height: 8),
          SecondaryButton(label: 'Закрыть', onPressed: () => Navigator.pop(sheet)),
        ],
      );
    },
  );
}
