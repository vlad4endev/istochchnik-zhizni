import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../data/prayer_source.dart';
import '../logic/prayer_logic.dart';
import 'sheet_frame.dart';

/// Рассылка молитвы дня в Telegram (только администратор): превью и отправка сейчас.
/// Расписание автоматической рассылки настраивается на сайте.
Future<void> showTelegramDispatchSheet(BuildContext context, PrayerSource source, DateTime date) {
  return showPrayerSheet<void>(
    context,
    title: 'Рассылка в Telegram',
    subtitle: 'Молитва на ${longDate(date)}. Автоматическую рассылку по расписанию настраивают на сайте.',
    builder: (_) => TelegramDispatch(source: source, date: date),
  );
}

class TelegramDispatch extends StatefulWidget {
  const TelegramDispatch({super.key, required this.source, required this.date});
  final PrayerSource source;
  final DateTime date;

  @override
  State<TelegramDispatch> createState() => _TelegramDispatchState();
}

class _TelegramDispatchState extends State<TelegramDispatch> {
  String? _preview;
  String? _loadError;
  bool _sending = false;
  String? _result;
  String? _sendError;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  Future<void> _loadPreview() async {
    setState(() => _loadError = null);
    try {
      final text = await widget.source.telegramPreview(ymdKey(widget.date));
      if (mounted) setState(() => _preview = text);
    } catch (error) {
      if (mounted) setState(() => _loadError = actionError(error));
    }
  }

  Future<void> _send() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Отправить рассылку сейчас?'),
        content: const Text('Сообщение получат все, кто подключён к рассылке. Отменить отправку нельзя.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Отправить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _sending = true;
      _sendError = null;
      _result = null;
    });
    try {
      final sent = await widget.source.telegramSendNow(ymdKey(widget.date));
      if (mounted) {
        setState(() {
          _sending = false;
          _result = 'Рассылка отправлена: $sent';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _sendError = actionError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final Widget preview;
    if (_loadError != null) {
      preview = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InfoBanner(_loadError!, error: true),
          const SizedBox(height: 8),
          SecondaryButton(label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _loadPreview),
        ],
      );
    } else if (_preview == null) {
      preview = const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator()));
    } else {
      preview = Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: palette.hairline),
        ),
        child: Text(
          _preview!.trim().isEmpty ? 'На эту дату сообщение пустое.' : _preview!,
          style: TextStyle(fontSize: 14.5, height: 1.45, color: palette.ink),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Так выглядит сообщение', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted)),
        const SizedBox(height: 8),
        preview,
        if (_sendError != null) ...[
          const SizedBox(height: 12),
          InfoBanner(_sendError!, error: true),
        ],
        if (_result != null) ...[
          const SizedBox(height: 12),
          InfoBanner(_result!),
        ],
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'Отправить сейчас',
          icon: Icons.send_rounded,
          busy: _sending,
          onPressed: _preview == null || _preview!.trim().isEmpty || _sending ? null : _send,
        ),
      ],
    );
  }
}
