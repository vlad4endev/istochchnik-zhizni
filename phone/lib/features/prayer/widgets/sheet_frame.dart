import 'package:dio/dio.dart' show DioException;
import 'package:material_ui/material_ui.dart';

import '../../../core/session.dart' show readApiError;
import '../../../ui/kit/kit.dart';

/// Текст ошибки действия для пользователя: ответ сервера или «нет связи».
String actionError(Object error) {
  if (error is DioException) return readApiError(error);
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

/// Нижний лист молитвенных форм: ручка, заголовок, прокрутка и отступ под клавиатуру.
Future<T?> showPrayerSheet<T>(
  BuildContext context, {
  required String title,
  required Widget Function(BuildContext context) builder,
  String? subtitle,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (sheetContext) => _SheetFrame(title: title, subtitle: subtitle, child: builder(sheetContext)),
  );
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.child, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final media = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.92),
        decoration: BoxDecoration(
          color: palette.sheet,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet)),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(20, 10, 20, 20 + media.padding.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(color: palette.outline, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const SizedBox(height: 14),
                Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, height: 1.2, color: palette.ink),
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(subtitle!, style: TextStyle(fontSize: 14, height: 1.4, color: palette.inkMuted)),
                ],
                const SizedBox(height: 16),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
