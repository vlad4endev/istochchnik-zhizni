import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:material_ui/material_ui.dart';

/// Цвет нативного экрана запуска (android/app/src/main/res/values/colors.xml → splash_background).
const restoreCoverColor = Color(0xFF1E0710);

/// Пока приложение возвращает человека в чат после окна выбора файла, закрывает экран заставкой
/// того же цвета, что и запуск: «тёмный запуск → чат» без мелькания «Главной».
class RestoreGate extends StatelessWidget {
  const RestoreGate({super.key, required this.restoring, required this.child});

  final ValueListenable<bool> restoring;
  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: restoring,
        child: child,
        builder: (context, active, child) => Stack(
          children: [
            child!,
            if (active)
              const Positioned.fill(
                key: Key('restore-cover'),
                child: ColoredBox(
                  color: restoreCoverColor,
                  child: Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5))),
                ),
              ),
          ],
        ),
      );
}
