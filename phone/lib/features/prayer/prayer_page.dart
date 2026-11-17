import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../profile/profile_page.dart';

class PrayerPage extends StatefulWidget {
  const PrayerPage({super.key});

  @override
  State<PrayerPage> createState() => _PrayerPageState();
}

class _PrayerPageState extends State<PrayerPage> {
  DateTime _date = DateTime.now();
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _iso {
    final utc = DateTime.utc(_date.year, _date.month, _date.day);
    return '${utc.year.toString().padLeft(4, '0')}-${utc.month.toString().padLeft(2, '0')}-${utc.day.toString().padLeft(2, '0')}';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final day = await ChurchApi(context.read<SessionController>()).day(_iso);
      if (!mounted) return;
      setState(() {
        _day = day;
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

  void _shift(int days) {
    setState(() => _date = _date.add(Duration(days: days)));
    _load();
  }

  Future<void> _pick() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(DateTime.now().year + 2),
      helpText: 'Дата молитвы',
    );
    if (picked == null) return;
    setState(() => _date = picked);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final members = asList(_day['members']);
    final themes = asList(_day['global_themes']);
    final ministries = asList(_day['ministries']);
    return ChurchPage(
      title: 'Молитва',
      subtitle: 'Молитвенный цикл церкви',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 0),
            child: _DateBar(date: _date, onPrev: () => _shift(-1), onNext: () => _shift(1), onPick: _pick),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 0),
            child: _MyNeed(),
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: members.isEmpty && themes.isEmpty && ministries.isEmpty
                  ? const EmptyHint(
                      'На эту дату записей нет',
                      icon: Icons.church_outlined,
                      hint: 'Выберите другой день — молитвенный цикл составляет администратор.',
                    )
                  : SheetList(
                      onRefresh: _load,
                      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 32),
                      children: [
                        if (members.isNotEmpty) const SectionLabel('Сегодня молимся за члена церкви'),
                        for (final raw in members)
                          _PrayerBlock(
                            data: asMap(raw),
                            titleKey: 'name',
                            bodyKey: 'prayer_request',
                            tone: Tone.violet,
                            icon: Icons.favorite_border_rounded,
                            withAvatar: true,
                          ),
                        if (themes.isNotEmpty) const SectionLabel('Тема дня'),
                        for (final raw in themes)
                          _PrayerBlock(
                            data: asMap(raw),
                            titleKey: 'title',
                            bodyKey: 'prayer_points',
                            tone: Tone.teal,
                            icon: Icons.menu_book_outlined,
                          ),
                        if (ministries.isNotEmpty) const SectionLabel('Служения'),
                        for (final raw in ministries)
                          _PrayerBlock(
                            data: asMap(raw),
                            titleKey: 'title',
                            bodyKey: 'prayer_points',
                            tone: Tone.amber,
                            icon: Icons.volunteer_activism_outlined,
                          ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Своя молитвенная нужда — в один тап от экрана молитвы.
class _MyNeed extends StatelessWidget {
  const _MyNeed();

  @override
  Widget build(BuildContext context) {
    final need = context.watch<SessionController>().user?.prayerRequest.trim() ?? '';
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: ListRow(
        leading: const IconTile(Icons.favorite_border_rounded, tone: Tone.violet),
        title: 'Моя молитвенная нужда',
        subtitle: need.isEmpty ? 'Не указана — расскажите, о чём молиться за вас' : need,
        onTap: () => pushPage(context, const ProfilePage(focusNeed: true)),
      ),
    );
  }
}

class _DateBar extends StatelessWidget {
  const _DateBar({required this.date, required this.onPrev, required this.onNext, required this.onPick});

  final DateTime date;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final today = sameDay(date, DateTime.now());
    return ChurchCard(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Предыдущий день',
            onPressed: onPrev,
            icon: Icon(Icons.chevron_left_rounded, color: palette.accent),
          ),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(Radii.md),
              onTap: onPick,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.calendar_today_outlined, size: 18, color: palette.accent),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        longDate(date),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.ink),
                      ),
                    ),
                    if (today) ...[const SizedBox(width: 8), const StatusPill('СЕГОДНЯ')],
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Следующий день',
            onPressed: onNext,
            icon: Icon(Icons.chevron_right_rounded, color: palette.accent),
          ),
        ],
      ),
    );
  }
}

class _PrayerBlock extends StatelessWidget {
  const _PrayerBlock({
    required this.data,
    required this.titleKey,
    required this.bodyKey,
    required this.tone,
    required this.icon,
    this.withAvatar = false,
  });

  final Map<String, dynamic> data;
  final String titleKey;
  final String bodyKey;
  final Tone tone;
  final IconData icon;
  final bool withAvatar;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final title = str(data[titleKey]).isEmpty ? 'Не указано' : str(data[titleKey]);
    final body = str(data[bodyKey]);
    final verse = str(data['bible_verse']);
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: tone.fg(palette)),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (withAvatar) ChurchAvatar(name: title, size: 42) else IconTile(icon, tone: tone),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink),
                          ),
                        ),
                      ],
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(body, style: ChurchType.body.copyWith(color: palette.inkMuted)),
                    ],
                    if (verse.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      ScriptureQuote(verse),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
