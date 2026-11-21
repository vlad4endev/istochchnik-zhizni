import 'package:material_ui/material_ui.dart';

import '../../../core/session.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../data/prayer_source.dart';
import 'sheet_frame.dart';

/// Границы длины — те же, что проверяет сервер.
const needMinLength = 5;
const needMaxLength = 2000;

/// Поделиться нуждой: сообщение уходит в молитвенный чат церкви.
Future<void> showShareNeedSheet(BuildContext context, PrayerSource source, AppUser? user) async {
  final sent = await showPrayerSheet<bool>(
    context,
    title: 'Поделиться нуждой',
    subtitle: 'Сообщение попадёт в молитвенный чат церкви — там за вас помолятся.',
    builder: (_) => ShareNeedForm(source: source, senderName: user?.displayName),
  );
  if (sent == true && context.mounted) showMessage(context, 'Нужда отправлена в молитвенный чат');
}

class ShareNeedForm extends StatefulWidget {
  const ShareNeedForm({super.key, required this.source, this.senderName});
  final PrayerSource source;
  final String? senderName;

  @override
  State<ShareNeedForm> createState() => _ShareNeedFormState();
}

class _ShareNeedFormState extends State<ShareNeedForm> {
  final _text = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  int get _length => _text.text.trim().characters.length;
  bool get _valid => _length >= needMinLength && _length <= needMaxLength;

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.source.submitNeed(_text.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = actionError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tooLong = _length > needMaxLength;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.senderName != null && widget.senderName!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text.rich(
              TextSpan(
                text: 'От кого: ',
                style: TextStyle(color: palette.inkMuted),
                children: [
                  TextSpan(
                    text: widget.senderName,
                    style: TextStyle(fontWeight: FontWeight.w800, color: palette.ink),
                  ),
                ],
              ),
            ),
          ),
        LabeledField(
          label: 'Ваша нужда',
          controller: _text,
          hint: 'Напишите, о чём помолиться…',
          minLines: 4,
          maxLines: 8,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          keyboardType: TextInputType.multiline,
          onChanged: (_) => setState(() {}),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              tooLong ? 'Слишком длинно: $_length / $needMaxLength' : '$_length / $needMaxLength · минимум $needMinLength',
              style: TextStyle(fontSize: 12, color: tooLong ? ChurchColors.danger : palette.inkFaint),
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          InfoBanner(_error!, error: true),
        ],
        const SizedBox(height: 12),
        PrimaryButton(
          label: 'Отправить в чат',
          icon: Icons.send_rounded,
          busy: _busy,
          onPressed: _valid && !_busy ? _send : null,
        ),
      ],
    );
  }
}
