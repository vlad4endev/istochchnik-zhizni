import 'package:material_ui/material_ui.dart';

import '../../core/push_check.dart';
import '../../ui/kit/kit.dart';
import '../prayer/widgets/sheet_frame.dart';

/// Проверка уведомлений шаг за шагом — показывает, где именно рвётся цепочка.
Future<void> showPushCheck(BuildContext context, {PushCheckEnv env = const DevicePushCheckEnv()}) {
  return showPrayerSheet<void>(
    context,
    title: 'Проверка уведомлений',
    subtitle: 'Покажет, на каком шаге что-то не так',
    builder: (_) => PushCheckView(env: env),
  );
}

class PushCheckView extends StatefulWidget {
  const PushCheckView({super.key, required this.env});

  final PushCheckEnv env;

  @override
  State<PushCheckView> createState() => _PushCheckViewState();
}

class _PushCheckViewState extends State<PushCheckView> {
  List<PushCheckStep> _steps = const [];
  bool _running = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    setState(() {
      _running = true;
      _done = false;
      _steps = const [];
    });
    try {
      final steps = await runPushCheck(widget.env, onStep: (s) {
        if (mounted) setState(() => _steps = s);
      });
      if (mounted) setState(() => _steps = steps);
    } catch (e) {
      if (mounted) {
        setState(() => _steps = [..._steps, PushCheckStep(title: 'Проверка', ok: false, detail: 'Неожиданная ошибка: $e')]);
      }
    } finally {
      if (mounted) {
        setState(() {
          _running = false;
          _done = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final failed = _steps.where((s) => !s.ok).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final s in _steps)
          Padding(
            key: ValueKey('check-${s.title}'),
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(s.ok ? Icons.check_circle_rounded : Icons.cancel_rounded, color: s.ok ? ChurchColors.successBright : ChurchColors.danger, size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: palette.ink)),
                      Text(s.detail, style: TextStyle(fontSize: 13.5, height: 1.35, color: palette.inkMuted)),
                      if (s.hint != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(s.hint!, style: TextStyle(fontSize: 13, height: 1.35, fontWeight: FontWeight.w600, color: s.ok ? palette.inkMuted : palette.accent))),
                    ],
                  ),
                ),
              ],
            ),
          ),
        if (_running) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.6)))),
        if (_done) ...[
          const SizedBox(height: 4),
          if (failed.isEmpty)
            const InfoBanner('Всё настроено верно. Если уведомление не появилось в шторке за 10–20 секунд, напишите об этом администратору.')
          else
            InfoBanner('Не прошло шагов: ${failed.length}. Сделайте то, что написано под красным пунктом, и проверьте ещё раз.', error: true),
          const SizedBox(height: 10),
          SecondaryButton(key: const ValueKey('check-again'), label: 'Проверить ещё раз', icon: Icons.refresh_rounded, onPressed: _run),
        ],
      ],
    );
  }
}
