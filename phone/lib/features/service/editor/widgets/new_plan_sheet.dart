import 'package:material_ui/material_ui.dart';

import '../../../../core/church_api.dart' show describeDio;
import '../../../../core/dates.dart';
import '../../../../ui/kit/kit.dart';
import '../../../../ui/widgets.dart' show LoadingView;
import '../../../prayer/widgets/sheet_frame.dart';
import '../data/editor_source.dart';
import '../models/editor_models.dart';

/// «Новая программа»: шаблон и дата → создаётся программа, возвращается её id.
Future<int?> showNewPlanSheet(BuildContext context, PlanEditorSource source) {
  return showPrayerSheet<int>(
    context,
    title: 'Новая программа',
    subtitle: 'Блоки возьмутся из шаблона',
    builder: (_) => NewPlanForm(source: source),
  );
}

class NewPlanForm extends StatefulWidget {
  const NewPlanForm({super.key, required this.source, this.today});

  final PlanEditorSource source;
  final DateTime? today;

  @override
  State<NewPlanForm> createState() => _NewPlanFormState();
}

class _NewPlanFormState extends State<NewPlanForm> {
  bool _loading = true;
  bool _creating = false;
  String? _error;
  List<PlanTemplate> _templates = const [];
  int? _templateId;
  late DateTime _date = _nextSunday(widget.today ?? DateTime.now());

  /// Ближайшее воскресенье (включая сегодня) — типичная дата служения.
  static DateTime _nextSunday(DateTime now) {
    final d = DateTime(now.year, now.month, now.day);
    return d.add(Duration(days: (DateTime.sunday - d.weekday) % 7));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.source.templates();
      if (!mounted) return;
      setState(() {
        _templates = list;
        _templateId = list.isEmpty ? null : list.first.id;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeDio(e);
        _loading = false;
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime(2100), locale: const Locale('ru'));
    if (picked != null) setState(() => _date = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _create() async {
    final id = _templateId;
    if (id == null || _creating) return;
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      final planId = await widget.source.createPlan(templateId: id, date: _date);
      if (mounted) Navigator.of(context).pop(planId);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = e is StateError ? e.message : describeDio(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (_loading) return const Padding(padding: EdgeInsets.all(32), child: LoadingView());
    if (_templates.isEmpty && _error == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('Шаблонов пока нет — программа строится по шаблону. Создайте шаблон на сайте или обратитесь к координатору служения.', style: TextStyle(fontSize: 14.5, color: palette.inkMuted)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_error != null) ...[InfoBanner(_error!, error: true), const SizedBox(height: 8)],
        Text('Шаблон', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.inkMuted)),
        const SizedBox(height: 6),
        RadioGroup<int>(
          groupValue: _templateId,
          onChanged: (v) => setState(() => _templateId = v),
          child: Column(
            children: [
              for (final t in _templates)
                RadioListTile<int>(
                  key: ValueKey('template-${t.id}'),
                  contentPadding: EdgeInsets.zero,
                  value: t.id,
                  title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: t.description.isEmpty ? Text('Начало ${t.startTime}') : Text(t.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ListGroup(
          dividerIndent: 14,
          children: [
            ListRow(key: const ValueKey('new-plan-date'), leading: const IconTile(Icons.event_outlined, tone: Tone.violet, size: 36), title: 'Дата служения', subtitle: '${weekdayName(_date)}, ${longDate(_date)}', onTap: _pickDate),
          ],
        ),
        const SizedBox(height: 16),
        PrimaryButton(key: const ValueKey('new-plan-create'), label: 'Создать программу', icon: Icons.add_rounded, busy: _creating, onPressed: _creating || _templateId == null ? null : _create),
      ],
    );
  }
}
