import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'collection_page.dart';
import 'data/prayer_source.dart';
import 'logic/prayer_access.dart';
import 'models/prayer_models.dart';
import 'widgets/prayer_calendar.dart';
import 'widgets/telegram_sheet.dart';
import 'widgets/viewers_sheet.dart';

/// Молитва дня — как на сайте: плашка с датой и календарём, «Сбор нужд» для координаторов,
/// карточки члена церкви, темы, служений и отпавших.
/// Срочная нужда и объявление здесь не показываются: они на главной (кнопка «+»).
class PrayerPage extends StatefulWidget {
  const PrayerPage({super.key, this.source, this.loadDay});

  /// Для тестов; в приложении берётся из сессии.
  final PrayerSource? source;
  final Future<Map<String, dynamic>> Function(String iso)? loadDay;

  @override
  State<PrayerPage> createState() => _PrayerPageState();
}

class _PrayerPageState extends State<PrayerPage> with CacheWatcher<PrayerPage> {
  static final _first = DateTime(2020);
  static final _last = DateTime(2030, 12, 31);

  DateTime _date = DateTime.now();
  bool _calendarOpen = false;
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};
  late final PrayerSource _source;
  ViewersToday? _viewers;

  @override
  void initState() {
    super.initState();
    _source = widget.source ?? PrayerApi(context.read<SessionController>());
    _load();
    watchCache(const ['/api/calendar/'], () => _load(quiet: true));
    _registerVisit();
  }

  String get _iso =>
      '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  PrayerAccess get _access => PrayerAccess(context.read<SessionController>().user);

  /// Фиксируем визит (раз в сутки на человека) и, если можно, считаем посетителей.
  Future<void> _registerVisit() async {
    try {
      await _source.registerVisit();
    } catch (_) {
      // Сеть или сессия — странице это не мешает.
    }
    await _loadViewers();
  }

  Future<void> _loadViewers() async {
    if (!mounted || !_access.canViewViewers) return;
    try {
      final viewers = await _source.viewers();
      if (mounted) setState(() => _viewers = viewers);
    } catch (_) {
      // Статистика — необязательная часть экрана.
    }
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final day = widget.loadDay != null
          ? await widget.loadDay!(_iso)
          : await ChurchApi(context.read<SessionController>()).day(_iso);
      if (!mounted) return;
      setState(() {
        _day = day;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || quiet) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  void _select(DateTime date) {
    setState(() {
      _date = date;
      _calendarOpen = false;
    });
    _load();
  }

  String _memberTitle() {
    final today = DateTime.now();
    final day = DateTime(_date.year, _date.month, _date.day);
    final start = DateTime(today.year, today.month, today.day);
    if (day.isBefore(start)) return 'Молитвенная нужда за этот день';
    if (day.isAfter(start)) return 'Молитвенная нужда (по очереди цикла)';
    return 'Сегодня молимся за члена церкви';
  }

  @override
  Widget build(BuildContext context) {
    final access = PrayerAccess(context.watch<SessionController>().user);
    return ChurchPage(
      title: 'Молитва',
      subtitle: 'Молитвенный цикл церкви',
      body: SheetList(
        onRefresh: () async {
          await _load();
          await _loadViewers();
        },
        padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 32),
        children: [
          PrayerDateChip(date: _date, expanded: _calendarOpen, onTap: () => setState(() => _calendarOpen = !_calendarOpen)),
          if (_calendarOpen)
            PrayerCalendarPanel(
              selected: _date,
              first: _first,
              last: _last,
              onSelect: _select,
              onCollapse: () => setState(() => _calendarOpen = false),
            ),
          if (access.canViewCollection) _collectionBar(access),
          ..._dayContent(),
          if (access.canViewViewers && _viewers != null) _ViewersCard(viewers: _viewers!),
        ],
      ),
    );
  }

  /// «Сбор нужд · очередь недели»; у администратора справа значок рассылки в Telegram.
  Widget _collectionBar(PrayerAccess access) {
    final palette = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: ChurchColors.wine.withValues(alpha: 0.3)),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: InkWell(
                onTap: () => pushPage(context, const CollectionPage()),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 56),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(
                      children: [
                        const _SolidTile(Icons.assignment_outlined),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Сбор нужд · очередь недели',
                            style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (access.canTelegramDispatch) ...[
              VerticalDivider(width: 1, color: palette.hairline),
              Tooltip(
                message: 'Рассылка молитвы в Telegram',
                child: Semantics(
                  button: true,
                  label: 'Рассылка молитвы в Telegram',
                  child: InkWell(
                    onTap: () => showTelegramDispatchSheet(context, _source, _date),
                    child: const SizedBox(width: 64, child: Center(child: _SolidTile(Icons.send_rounded))),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _dayContent() {
    if (_loading) {
      return const [Padding(padding: EdgeInsets.symmetric(vertical: 40), child: LoadingView())];
    }
    if (_error != null) return [SizedBox(height: 260, child: ErrorView(message: _error!, onRetry: _load))];
    final members = asList(_day['members']);
    final themes = asList(_day['global_themes']);
    final ministries = asList(_day['ministries']);
    final backsliders = Backslider.parseList(_day['backsliders']);
    if (members.isEmpty && themes.isEmpty && ministries.isEmpty && backsliders.isEmpty) {
      return [
        const EmptyHint(
          'Нет данных на эту дату',
          icon: Icons.volunteer_activism_outlined,
          hint: 'Выберите другую дату в календаре выше — появятся темы и нужды.',
        ),
      ];
    }
    return [
      if (members.isNotEmpty) _SectionHeader(icon: Icons.church_outlined, title: _memberTitle()),
      for (final raw in members)
        _PrayerCard(
          icon: Icons.volunteer_activism_outlined,
          tone: Tone.violet,
          title: str(asMap(raw)['name']).trim().isEmpty ? 'Не указано' : str(asMap(raw)['name']).trim(),
          child: _bodyText(str(asMap(raw)['prayer_request']), 'Нет указанных нужд'),
        ),
      for (final raw in themes) _themeCard(asMap(raw)),
      for (final raw in ministries)
        _PrayerCard(
          icon: Icons.handyman_outlined,
          tone: Tone.amber,
          title: str(asMap(raw)['title']),
          child: _bodyText(str(asMap(raw)['prayer_points']), 'Нет указанных пунктов молитвы'),
        ),
      if (backsliders.isNotEmpty) const _SectionHeader(icon: Icons.volunteer_activism_outlined, title: 'Молимся за отпавшего'),
      for (final b in backsliders)
        _PrayerCard(
          icon: Icons.person_off_outlined,
          tone: Tone.rose,
          title: b.name,
          child: const _Muted('Отпавший — нуждается в молитве о возвращении', italic: true),
        ),
    ];
  }

  Widget _themeCard(Map<String, dynamic> theme) {
    final verse = str(theme['bible_verse']).trim();
    final points = str(theme['prayer_points']).trim();
    return _PrayerCard(
      icon: Icons.menu_book_outlined,
      tone: Tone.teal,
      title: str(theme['title']),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (verse.isNotEmpty) ...[
            ScriptureQuote(verse),
            if (points.isNotEmpty) const SizedBox(height: 12),
          ],
          if (points.isNotEmpty) _bodyText(points, ''),
          if (verse.isEmpty && points.isEmpty) const _Muted('Нет дополнительной информации', italic: true),
        ],
      ),
    );
  }

  Widget _bodyText(String text, String emptyText) {
    if (text.trim().isEmpty) return _Muted(emptyText, italic: true);
    return Text(text.trim(), style: ChurchType.body.copyWith(fontSize: 15.5, color: context.palette.inkMuted));
  }
}

/// Сплошная винная плитка с белой иконкой — акцент кнопок координатора, как на сайте.
class _SolidTile extends StatelessWidget {
  const _SolidTile(this.icon);
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(color: ChurchColors.wine, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Icon(icon, size: 20, color: Colors.white),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text, {this.italic = false});
  final String text;
  final bool italic;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: ChurchType.body.copyWith(
          fontSize: 15,
          fontStyle: italic ? FontStyle.italic : null,
          color: context.palette.inkMuted,
        ),
      );
}

/// Заголовок секции: иконка в плитке и жирный текст.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: palette.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.accent.withValues(alpha: 0.2)),
            ),
            child: Icon(icon, color: palette.accent, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Карточка молитвы: цветная полоса слева, иконка и название, ниже — текст.
class _PrayerCard extends StatelessWidget {
  const _PrayerCard({required this.icon, required this.tone, required this.title, required this.child});

  final IconData icon;
  final Tone tone;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 3, color: tone.fg(palette)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 16, 12),
                    child: Row(
                      children: [
                        IconTile(icon, tone: tone, size: 44, radius: 12),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.25, color: palette.ink),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: palette.hairline),
                  Padding(padding: const EdgeInsets.fromLTRB(14, 14, 16, 16), child: child),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Сегодня раздел открыли N человек» — для пастора и администратора.
class _ViewersCard extends StatelessWidget {
  const _ViewersCard({required this.viewers});

  final ViewersToday viewers;

  @override
  Widget build(BuildContext context) {
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: ListRow(
        leading: const IconTile(Icons.visibility_outlined, tone: Tone.neutral, size: 38),
        title: viewersCaption(viewers.count),
        subtitle: 'Посмотреть список',
        onTap: () => showViewersSheet(context, viewers),
      ),
    );
  }
}
