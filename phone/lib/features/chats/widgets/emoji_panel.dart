import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
// ignore: deprecated_member_use
import 'package:flutter_localizations/flutter_localizations.dart' as legacy show GlobalMaterialLocalizations;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';

/// Каталог эмодзи: русские названия и поиск, недавние, оттенки кожи.
/// Работает и под полем ввода (вставляет в текст), и в листе выбора реакции.
class EmojiPanel extends StatelessWidget {
  const EmojiPanel({super.key, this.textController, this.onSelected, this.onBackspace, this.height = 300});

  /// Если задан, эмодзи вставляются прямо в это поле.
  final TextEditingController? textController;
  final ValueChanged<String>? onSelected;
  final VoidCallback? onBackspace;
  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final bg = palette.isDark ? palette.card : const Color(0xFFF3ECE3);
    // Каталог эмодзи построен на стандартных виджетах Flutter (TabBar), которым нужны «классические»
    // MaterialLocalizations, а приложение подключает локализации через material_ui. Добавляем их
    // только вокруг каталога — глобальные настройки приложения не меняются.
    return Localizations.override(
      context: context,
      locale: const Locale('ru'),
      // ignore: deprecated_member_use
      delegates: [legacy.GlobalMaterialLocalizations.delegate],
      child: SizedBox(
      height: height,
      child: EmojiPicker(
        textEditingController: textController,
        onEmojiSelected: (category, emoji) => onSelected?.call(emoji.emoji),
        onBackspacePressed: onBackspace,
        config: Config(
          height: height,
          // Проверка «умеет ли телефон нарисовать этот эмодзи» отсеивает новые символы на старых Android.
          checkPlatformCompatibility: !kIsWeb,
          locale: const Locale('ru'),
          emojiViewConfig: EmojiViewConfig(
            columns: 8,
            emojiSizeMax: 30,
            backgroundColor: bg,
            noRecents: Text('Недавних пока нет', style: TextStyle(fontSize: 14, color: palette.inkMuted)),
          ),
          categoryViewConfig: CategoryViewConfig(
            // Сразу смайлики: «Недавние» пусты, пока человек ничего не выбирал.
            initCategory: Category.SMILEYS,
            backgroundColor: bg,
            indicatorColor: palette.accent,
            iconColor: palette.inkFaint,
            iconColorSelected: palette.accent,
            backspaceColor: palette.accent,
            dividerColor: palette.hairline,
          ),
          bottomActionBarConfig: const BottomActionBarConfig(enabled: false),
          searchViewConfig: SearchViewConfig(
            backgroundColor: bg,
            buttonIconColor: palette.inkMuted,
            hintText: 'Поиск эмодзи',
            inputTextStyle: TextStyle(color: palette.ink),
          ),
          skinToneConfig: const SkinToneConfig(),
        ),
      ),
      ),
    );
  }
}
