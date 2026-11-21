import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'collection_page.dart';
import 'data/prayer_source.dart';
import 'logic/prayer_access.dart';
import 'models/prayer_models.dart';
import 'prayer_controllers.dart';
import 'widgets/note_card.dart';
import 'widgets/note_editor.dart';
import 'widgets/share_need_sheet.dart';
import 'widgets/telegram_sheet.dart';
import 'widgets/viewers_sheet.dart';

class PrayerPage extends StatefulWidget {
  const PrayerPage({super.key, this.source, this.loadDay});

  /// Для тестов; в приложении берётся из сессии.
  final PrayerSource? source;
  final Future<Map<String, dynamic>> Function(String iso)? loadDay;

  @override
  State<PrayerPage> createState() => _PrayerPageState();
}

class _PrayerPageState extends State<PrayerPage> {
  DateTime _date = DateTime.now();
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};
  late final PrayerSource _source;
  late final NotesController _notes;
  ViewersToday? _viewers;

  @override
  void initState() {
    super.initState();
    _source = widget.source ?? PrayerApi(context.read<SessionController>());
    _notes = NotesController(_source);
    _load();
    _registerVisit();
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  String get _iso {
    final utc = DateTime.utc(_date.year, _date.month, _date.day);
    return '${utc.year.toString().padLeft(4, '0')}-${utc.month.toString().padLeft(2, '0')}-${utc.day.toString().padLeft(2, '0')}';
  }

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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    unawaited(_notes.load(_date));
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

  Future<void> _editNote(NoteKind kind) async {
    final changed = await showNoteEditor(context, _notes, kind, DateTime.now());
    if (changed && mounted) _notes.load(_date);
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
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 0),
            child: _DateBar(date: _date, onPrev: () => _shift(-1), onNext: () => _shift(1), onPick: _pick),
          ),
          Expanded(
            child: ListenableBuilder(
              listenable: _notes,
              builder: (context, _) => SheetList(
                onRefresh: () async {
                  await _load();
                  await _loadViewers();
                },
                padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, 32),
                children: [
                  if (_notes.notes.urgent != null)
                    NoteCard(
                      kind: NoteKind.urgentPrayer,
                      note: _notes.notes.urgent!,
                      onEdit: access.canManageNotes ? () => _editNote(NoteKind.urgentPrayer) : null,
                      onDelete: access.canManageNotes
                          ? () => deleteNoteWithConfirm(context, _notes, NoteKind.urgentPrayer, _date)
                          : null,
                    ),
                  _ShareNeed(onShare: () => showShareNeedSheet(context, _source, context.read<SessionController>().user)),
                  if (access.canViewCollection || access.canManageNotes) ..._coordinatorTools(access),
                  ..._dayContent(),
                  if (access.canViewViewers && _viewers != null) _ViewersCard(viewers: _viewers!),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _coordinatorTools(PrayerAccess access) {
    final urgent = _notes.notes.urgent;
    final announcement = _notes.notes.announcement;
    return [
      const SectionLabel('Координаторам'),
      ListGroup(
        dividerIndent: 70,
        children: [
          if (access.canViewCollection)
            ListRow(
              leading: const IconTile(Icons.assignment_outlined, tone: Tone.wine),
              title: 'Сбор нужд · очередь недели',
              subtitle: 'Кто в очереди, кто собирает нужды',
              onTap: () => pushPage(context, const CollectionPage()),
            ),
          if (access.canManageNotes && urgent == null)
            ListRow(
              leading: const IconTile(Icons.local_fire_department_rounded, tone: Tone.red),
              title: 'Срочная молитвенная нужда',
              subtitle: 'Показать всем участникам',
              onTap: () => _editNote(NoteKind.urgentPrayer),
            ),
          if (access.canManageNotes)
            ListRow(
              leading: const IconTile(Icons.campaign_rounded, tone: Tone.amber),
              title: 'Объявление на главной',
              subtitle: announcement == null ? 'Не задано — добавить' : announcement.text,
              onTap: () => _editNote(NoteKind.announcement),
            ),
          if (access.canTelegramDispatch)
            ListRow(
              leading: const IconTile(Icons.send_rounded, tone: Tone.teal),
              title: 'Рассылка в Telegram',
              subtitle: 'Отправить молитву на ${longDate(_date)}',
              onTap: () => showTelegramDispatchSheet(context, _source, _date),
            ),
        ],
      ),
    ];
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
          'На эту дату записей нет',
          icon: Icons.church_outlined,
          hint: 'Выберите другой день — молитвенный цикл составляет администратор.',
        ),
      ];
    }
    return [
      if (members.isNotEmpty) SectionLabel(_memberTitle()),
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
      if (backsliders.isNotEmpty) const SectionLabel('Молимся за отпавшего'),
      for (final b in backsliders)
        _PrayerBlock(
          data: {'name': b.name, 'prayer_request': 'Отпавший — нуждается в молитве о возвращении'},
          titleKey: 'name',
          bodyKey: 'prayer_request',
          tone: Tone.rose,
          icon: Icons.person_off_outlined,
        ),
    ];
  }
}

/// Поделиться нуждой с молитвенным чатом церкви.
class _ShareNeed extends StatelessWidget {
  const _ShareNeed({required this.onShare});

  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: ListRow(
        leading: const IconTile(Icons.send_rounded, tone: Tone.teal),
        title: 'Поделиться нуждой с чатом',
        subtitle: 'Отправим в молитвенный чат церкви',
        onTap: onShare,
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
                    if (today) ...[const SizedBox(width: 8), const Flexible(child: StatusPill('СЕГОДНЯ'))],
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
