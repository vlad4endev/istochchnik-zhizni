import 'package:material_ui/material_ui.dart';

import '../../core/push_status.dart';
import '../../ui/kit/kit.dart';
import 'push_check_sheet.dart';
import 'push_samples_sheet.dart';

/// Состояние уведомлений и звонков с кнопками исправления. Только Android: на других платформах пушей нет.
class NotificationsCard extends StatefulWidget {
  const NotificationsCard({super.key, this.status});

  /// Для тестов; в приложении общий [PushStatus.instance].
  final PushStatus? status;

  @override
  State<NotificationsCard> createState() => _NotificationsCardState();
}

class _NotificationsCardState extends State<NotificationsCard> with WidgetsBindingObserver {
  late final PushStatus _status = widget.status ?? PushStatus.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _status.addListener(_changed);
    _status.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _status.removeListener(_changed);
    super.dispose();
  }

  /// Вернулись из системных настроек — перечитываем разрешения.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _status.refresh();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!_status.supported) return const SizedBox.shrink();
    final palette = context.palette;
    final notifications = _status.notificationsAllowed;
    final fullScreen = _status.fullScreenAllowed;
    final problem = _status.firebaseProblem;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel('Уведомления и звонки'),
        const SizedBox(height: Space.sm),
        ListGroup(children: [
          _Row(
            icon: Icons.notifications_active_outlined,
            title: 'Уведомления',
            ok: notifications != false,
            okText: 'Включены',
            badText: 'Выключены — сообщения и звонки не придут',
            action: 'Включить',
            onAction: _status.openNotificationSettings,
          ),
          _Row(
            icon: Icons.phone_in_talk_outlined,
            title: 'Звонок на весь экран',
            ok: fullScreen != false,
            okText: 'Разрешён',
            badText: 'Запрещён — звонок будет только небольшим уведомлением',
            action: 'Разрешить',
            onAction: _status.openFullScreenSettings,
          ),
          _Row(
            icon: Icons.cloud_done_outlined,
            title: 'Связь с сервером',
            ok: problem == null && _status.tokenRegistered,
            okText: 'Устройство зарегистрировано',
            badText: problem ?? 'Устройство не зарегистрировано — проверьте интернет',
          ),
        ]),
        const SizedBox(height: Space.sm),
        SecondaryButton(
          key: const ValueKey('push-check'),
          label: 'Проверить уведомления',
          icon: Icons.notifications_active_outlined,
          onPressed: () => showPushCheck(context),
        ),
        const SizedBox(height: Space.sm),
        SecondaryButton(
          key: const ValueKey('push-samples'),
          label: 'Примеры напоминаний',
          icon: Icons.campaign_outlined,
          onPressed: () => showPushSamples(context),
        ),
        if (!_status.allGood)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, Space.sm, 4, 0),
            child: Text(
              'Исправьте отмеченное красным, и вернитесь в приложение: статус обновится сам.',
              style: TextStyle(fontSize: 12.5, height: 1.4, color: palette.inkMuted),
            ),
          ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.ok,
    required this.okText,
    required this.badText,
    this.action,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final bool ok;
  final String okText;
  final String badText;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ListRow(
      leading: IconTile(icon, tone: ok ? Tone.green : Tone.red),
      title: title,
      subtitle: ok ? okText : badText,
      subtitleMaxLines: 3,
      trailing: ok || action == null
          ? StatusPill(ok ? 'Ок' : 'Нет', tone: ok ? Tone.green : Tone.red)
          : TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(minimumSize: const Size(48, 44), foregroundColor: palette.accent),
              child: Text(action!, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
    );
  }
}
