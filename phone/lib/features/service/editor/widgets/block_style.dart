import 'package:material_ui/material_ui.dart';

import '../../../../ui/kit/kit.dart';

/// Значок и цвет блока по ключу метки или коду типа (как на сайте).
(IconData, Tone) blockLook(String key) => switch (key) {
      'prayer' => (Icons.volunteer_activism_outlined, Tone.violet),
      'song' => (Icons.music_note_rounded, Tone.teal),
      'scripture' => (Icons.menu_book_outlined, Tone.amber),
      'sermon' => (Icons.mic_none_rounded, Tone.rose),
      'announcements' => (Icons.campaign_outlined, Tone.green),
      'offering' || 'donation' => (Icons.volunteer_activism, Tone.green),
      'birthdays' => (Icons.cake_outlined, Tone.rose),
      'communion' => (Icons.wine_bar_outlined, Tone.violet),
      'schedule' => (Icons.calendar_month_outlined, Tone.violet),
      'poem' => (Icons.edit_note_rounded, Tone.rose),
      'users' => (Icons.groups_outlined, Tone.teal),
      'clock' => (Icons.schedule_rounded, Tone.violet),
      'note' => (Icons.sticky_note_2_outlined, Tone.amber),
      'link' => (Icons.link_rounded, Tone.teal),
      _ => (Icons.extension_outlined, Tone.neutral),
    };
