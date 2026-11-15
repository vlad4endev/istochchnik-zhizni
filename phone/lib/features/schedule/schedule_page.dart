import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key});

  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> {
  bool _loading = true;
  String? _mediaError;
  String? _musicError;
  List<dynamic> _media = const [];
  List<dynamic> _music = const [];
  String _tab = 'media';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ChurchApi(context.read<SessionController>());
    final now = DateTime.now();
    final end = now.add(const Duration(days: 21));
    String ymd(DateTime date) =>
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    setState(() => _loading = _media.isEmpty && _music.isEmpty);
    try {
      _media = await api.mediaMine(ymd(now), ymd(end));
      _mediaError = null;
    } catch (error) {
      _media = const [];
      _mediaError = describeDio(error);
    }
    try {
      _music = await api.musicMine(ymd(now), ymd(end));
      _musicError = null;
    } catch (error) {
      _music = const [];
      _musicError = describeDio(error);
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final items = _tab == 'media' ? _media : _music;
    final error = _tab == 'media' ? _mediaError : _musicError;
    final total = _media.length + _music.length;
    return ChurchPage(
      title: 'Расписание',
      subtitle: 'Мои служения на три недели',
      subtitleAccent: total > 0 ? '$total впереди' : null,
      body: _loading
          ? const LoadingView()
          : SheetList(
              onRefresh: _load,
              children: [
                SegmentedPills<String>(
                  segments: [
                    ('media', _media.isEmpty ? 'Медиа' : 'Медиа · ${_media.length}'),
                    ('music', _music.isEmpty ? 'Музыка' : 'Музыка · ${_music.length}'),
                  ],
                  selected: _tab,
                  onChanged: (value) => setState(() => _tab = value),
                ),
                if (error != null && items.isEmpty)
                  ErrorView(message: error, onRetry: _load)
                else if (items.isEmpty)
                  const EmptyHint(
                    'Назначений нет',
                    icon: Icons.event_available_outlined,
                    hint: 'На ближайшие три недели вас не поставили в это служение.',
                  )
                else
                  for (final raw in items) _ScheduleCard(event: asMap(raw)),
              ],
            ),
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({required this.event});
  final Map<String, dynamic> event;

  (String, Tone) _status(String status) => switch (status) {
        'confirmed' => ('Подтверждено', Tone.green),
        'declined' => ('Отказ', Tone.red),
        'pending' => ('Ждёт ответа', Tone.amber),
        'assigned' => ('Назначено', Tone.wine),
        _ => (status, Tone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final date = parseApiDate(event['event_date']);
    final title = str(event['title']);
    final time = shortTime(event['start_time']);
    final assignments = asList(event['assignments']);
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(width: 4, color: ChurchColors.amberBlob),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (date != null)
                          Text(
                            weekdayName(date).toUpperCase(),
                            style: ChurchType.sectionLabel.copyWith(fontSize: 11, color: palette.inkFaint),
                          ),
                        Text(
                          date == null ? title : longDate(date),
                          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: palette.ink),
                        ),
                        Text(
                          [if (date != null) title, time].where((part) => part.isNotEmpty).join(' · '),
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: palette.inkMuted),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (assignments.isNotEmpty) ...[
            Divider(height: 1, color: palette.hairline),
            for (final raw in assignments)
              Builder(builder: (context) {
                final item = asMap(raw);
                final role = str(asMap(item['role'])['name']);
                final (label, tone) = _status(str(item['status']));
                return Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: tone.fg(palette)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          role.isEmpty ? 'Роль' : role,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: palette.ink),
                        ),
                      ),
                      if (label.isNotEmpty) StatusPill(label, tone: tone),
                    ],
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}
