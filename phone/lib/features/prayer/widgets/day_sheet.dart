import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../models/prayer_models.dart';
import '../prayer_controllers.dart';
import 'sheet_frame.dart';

const _needMaxLength = 8000;

/// Один день очереди: текст нужды, куратор, справка о прошлых нуждах.
Future<void> showDaySheet(BuildContext context, CollectionController controller, String ymd) {
  final day = controller.days.where((d) => d.ymd == ymd).firstOrNull;
  final name = day?.member?.displayName ?? 'День цикла';
  final date = day?.date;
  return showPrayerSheet<void>(
    context,
    title: name,
    subtitle: date == null ? null : '${DateFormat('EEEE', 'ru').format(date)}, ${dayMonth(date)}',
    builder: (_) => DaySheet(controller: controller, ymd: ymd),
  );
}

class DaySheet extends StatefulWidget {
  const DaySheet({super.key, required this.controller, required this.ymd});

  final CollectionController controller;
  final String ymd;

  @override
  State<DaySheet> createState() => _DaySheetState();
}

class _DaySheetState extends State<DaySheet> {
  late final TextEditingController _text;
  bool _saving = false;
  bool _improving = false;
  String? _error;
  String? _saved;

  CollectionController get _c => widget.controller;
  WeekDay? get _day => _c.days.where((d) => d.ymd == widget.ymd).firstOrNull;

  @override
  void initState() {
    super.initState();
    _text = TextEditingController(text: _day?.member?.prayerRequest ?? '');
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final day = _day;
    if (day == null) return;
    setState(() {
      _saving = true;
      _error = null;
      _saved = null;
    });
    try {
      await _c.saveNeed(day, _text.text);
      if (mounted) {
        setState(() {
          _saving = false;
          _saved = 'Сохранено. Участник получит уведомление.';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = actionError(error);
        });
      }
    }
  }

  Future<void> _improve() async {
    setState(() {
      _improving = true;
      _error = null;
      _saved = null;
    });
    try {
      final improved = await _c.improve(_text.text, _day?.member?.displayName ?? '');
      if (mounted) {
        setState(() {
          _improving = false;
          _text.text = improved;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _improving = false;
          _error = 'Не удалось улучшить текст с помощью ИИ: ${actionError(error)}';
        });
      }
    }
  }

  Future<void> _assign(int? coordinatorId) async {
    final member = _day?.member;
    if (member == null) return;
    try {
      await _c.assign(member.id, coordinatorId);
    } catch (error) {
      if (mounted) setState(() => _error = actionError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final member = _day?.member;
        if (member == null) {
          return Text('На этот день за участника никто не назначен.', style: TextStyle(color: palette.inkMuted));
        }
        final claim = _c.claims.of(member.id);
        final busy = _c.isBusy(member.id);
        final canAssign = !_c.claimsFailed && claim != null;
        final working = _saving || _improving;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LabeledField(
              label: 'Молитвенная нужда',
              controller: _text,
              hint: 'О чём просим молиться в этот день цикла…',
              minLines: 4,
              maxLines: 8,
              autofocus: false,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              onChanged: (_) => setState(() => _saved = null),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${_text.text.characters.length} / $_needMaxLength',
                  style: TextStyle(fontSize: 12, color: palette.inkFaint),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_error != null) ...[
              InfoBanner(_error!, error: true),
              const SizedBox(height: 8),
            ],
            if (_saved != null) ...[
              InfoBanner(_saved!),
              const SizedBox(height: 8),
            ],
            PrimaryButton(
              label: 'Сохранить нужду',
              icon: Icons.check_rounded,
              busy: _saving,
              onPressed: working || _text.text.characters.length > _needMaxLength ? null : _save,
            ),
            const SizedBox(height: 8),
            SecondaryButton(
              label: _improving ? 'ИИ работает…' : 'Улучшить с ИИ',
              icon: Icons.auto_awesome_rounded,
              onPressed: working || _text.text.trim().isEmpty ? null : _improve,
            ),
            const SizedBox(height: 4),
            Text(
              'Подготовлено с помощью ИИ — проверьте текст перед сохранением.',
              style: TextStyle(fontSize: 12, color: palette.inkFaint),
            ),
            const SizedBox(height: 20),
            Text('Ответственный за сбор', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted)),
            const SizedBox(height: 4),
            if (!canAssign)
              Text('Отметки сбора сейчас недоступны.', style: TextStyle(fontSize: 13.5, color: palette.inkMuted))
            else
              RadioGroup<int?>(
                groupValue: claim.claimedBy?.id,
                onChanged: (value) {
                  if (!busy) _assign(value);
                },
                child: Column(
                  children: [
                    RadioListTile<int?>(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      value: null,
                      enabled: !busy,
                      title: Text('Без ответственного', style: TextStyle(color: palette.ink)),
                    ),
                    for (final person in _c.claims.coordinators)
                      RadioListTile<int?>(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        value: person.id,
                        enabled: !busy,
                        title: Text(
                          person.id == _c.meId ? '${person.displayName} (вы)' : person.displayName,
                          style: TextStyle(color: palette.ink),
                        ),
                      ),
                  ],
                ),
              ),
            if (member.previousNeeds.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Предыдущие нужды (справка)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted)),
              const SizedBox(height: 6),
              for (final prev in member.previousNeeds)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.fromLTRB(12, 10, 4, 6),
                  decoration: BoxDecoration(
                    color: palette.card,
                    borderRadius: BorderRadius.circular(Radii.md),
                    border: Border.all(color: palette.hairline),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (prev.createdAt != null)
                        Text(
                          DateFormat('d MMM yyyy', 'ru').format(prev.createdAt!),
                          style: TextStyle(fontSize: 12, color: palette.inkFaint),
                        ),
                      Text(prev.note, style: TextStyle(fontSize: 14, height: 1.4, color: palette.ink)),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                          onPressed: working
                              ? null
                              : () => setState(() {
                                    _text.text = prev.note;
                                    _saved = null;
                                  }),
                          child: const Text('Подставить в нужду'),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}
