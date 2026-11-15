import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class ServicePage extends StatefulWidget {
  const ServicePage({super.key});

  @override
  State<ServicePage> createState() => _ServicePageState();
}

class _ServicePageState extends State<ServicePage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _plans = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final plans = await ChurchApi(context.read<SessionController>()).plans();
      if (!mounted) return;
      setState(() {
        _plans = plans;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChurchPage(
      title: 'Служение',
      subtitle: 'Программы богослужений',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _plans.isEmpty
            ? const EmptyHint('Планов служения нет', icon: Icons.event_note_outlined, hint: 'Программы составляют на сайте в разделе «Служение».')
            : SheetList(
                onRefresh: _load,
                children: [
                  const SectionLabel('Созданные программы'),
                  for (var i = 0; i < _plans.length; i++)
                    _PlanCard(
                      plan: asMap(_plans[i]),
                      nearest: i == 0,
                      onTap: () => pushPage(
                        context,
                        PlanPage(id: str(asMap(_plans[i])['id']), title: _planTitle(asMap(_plans[i]))),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

String _planTitle(Map<String, dynamic> plan) {
  final date = parseApiDate(plan['service_date']);
  return date == null ? str(plan['service_date']) : '${longDate(date)} г.';
}

(String, Tone?) planStatus(String status) => switch (status) {
      'draft' => ('Черновик', Tone.neutral),
      'published' => ('Опубликована', Tone.green),
      'archived' => ('Архив', Tone.neutral),
      'completed' => ('Прошла', Tone.neutral),
      '' => ('', null),
      _ => (status, Tone.neutral),
    };

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.nearest, required this.onTap});

  final Map<String, dynamic> plan;
  final bool nearest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final (status, tone) = planStatus(str(plan['status']));
    final blocks = asInt(plan['blocks_count']);
    final time = shortTime(plan['start_time']);
    final date = parseApiDate(plan['service_date']);
    return ChurchCard(
      onTap: onTap,
      border: nearest ? Border.all(color: palette.accent.withValues(alpha: 0.35), width: 1.4) : null,
      child: Row(
        children: [
          if (date != null) DateBadge(date: date) else const IconTile(Icons.event_note_outlined, tone: Tone.green, size: 52),
          const SizedBox(width: Space.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_planTitle(plan), style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, color: palette.ink)),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (nearest) const StatusPill('Ближайшая', solid: true),
                    if (status.isNotEmpty) StatusPill(status, tone: tone),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [if (time.isNotEmpty) 'Начало $time', if (blocks > 0) 'Блоков: $blocks'].join(' · '),
                  style: ChurchType.caption.copyWith(color: palette.inkMuted),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: palette.chevron),
        ],
      ),
    );
  }
}

class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.id, required this.title});
  final String id;
  final String title;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _plan = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final plan = await ChurchApi(context.read<SessionController>()).plan(widget.id);
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final nested = asMap(_plan['plan']).isEmpty ? _plan : asMap(_plan['plan']);
    final blocks = asList(_plan['blocks'] ?? nested['blocks']);
    final time = shortTime(nested['start_time']);
    return ChurchPage(
      title: widget.title.isEmpty ? 'Программа' : widget.title,
      subtitle: time.isEmpty ? null : 'Начало в $time',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          children: [
            if (str(nested['notes']).isNotEmpty) InfoBanner(str(nested['notes'])),
            if (blocks.isEmpty)
              const EmptyHint('В программе пока нет блоков', icon: Icons.view_agenda_outlined)
            else
              ListGroup(
                dividerIndent: 64,
                children: [
                  for (var i = 0; i < blocks.length; i++)
                    Builder(builder: (context) {
                      final block = asMap(blocks[i]);
                      final minutes = asInt(block['duration_minutes']);
                      final kind = str(block['block_type_name']).isNotEmpty
                          ? str(block['block_type_name'])
                          : str(block['block_type_code']);
                      return ListRow(
                        leading: Container(
                          width: 38,
                          height: 38,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(Radii.sm)),
                          child: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w800, color: palette.accent)),
                        ),
                        title: str(block['title']).isEmpty ? (kind.isEmpty ? 'Блок' : kind) : str(block['title']),
                        subtitle: [
                          if (str(block['title']).isNotEmpty) kind,
                          str(block['song_title']),
                          str(block['assigned_member_name']),
                        ].where((part) => part.isNotEmpty).join(' · '),
                        subtitleMaxLines: 2,
                        trailing: minutes > 0 ? StatusPill('$minutes мин', tone: Tone.neutral) : null,
                      );
                    }),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
