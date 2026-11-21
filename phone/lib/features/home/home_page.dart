import 'dart:async';

import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/audio_player_page.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../bible/bible_page.dart';
import '../broadcast/broadcast_page.dart';
import '../profile/profile_page.dart';
import '../events/events_page.dart';
import '../chats/thread_page.dart';
import '../prayer/collection_page.dart';
import '../prayer/data/prayer_source.dart';
import '../prayer/logic/prayer_access.dart';
import '../prayer/models/prayer_models.dart';
import '../prayer/prayer_controllers.dart';
import '../prayer/prayer_page.dart';
import '../prayer/widgets/home_blocks.dart';
import '../prayer/widgets/note_card.dart';
import '../prayer/widgets/note_editor.dart';
import '../prayer/widgets/sheet_frame.dart';
import '../sermons/sermons_page.dart';
import '../songbook/songbook_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key, this.prayerSource});

  /// Для тестов; в приложении берётся из сессии.
  final PrayerSource? prayerSource;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};
  List<dynamic> _events = const [];
  Map<String, dynamic> _podcasts = {};
  Map<String, dynamic> _broadcast = {};
  late final HomeExtrasController _extras;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _extras = HomeExtrasController(
      widget.prayerSource ?? PrayerApi(session),
      access: PrayerAccess(session.user),
      meId: session.user?.id ?? 0,
    );
    _load();
  }

  @override
  void dispose() {
    _extras.dispose();
    super.dispose();
  }

  Future<void> _editNote(NoteKind kind) async {
    final changed = await showNoteEditor(context, _extras.notesController, kind, DateTime.now());
    if (changed && mounted) _extras.notesController.load(DateTime.now());
  }

  Future<void> _message(Birthday person) async {
    try {
      final id = await ChurchApi(context.read<SessionController>()).openPersonal(person.id);
      if (!mounted || id.isEmpty) return;
      await pushPage(context, ThreadPage(conversationId: id, title: person.name, otherMemberId: person.id));
    } catch (error) {
      if (mounted) showMessage(context, actionError(error));
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = _day.isEmpty && _events.isEmpty;
      _error = null;
    });
    final api = ChurchApi(context.read<SessionController>());
    final today = DateTime.now();
    unawaited(_extras.load(today));
    final iso =
        '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    try {
      final results = await Future.wait<Object?>([
        api.day(iso),
        api.events(),
        api.podcasts(),
        api.broadcast(),
      ]);
      if (!mounted) return;
      setState(() {
        _day = results[0] as Map<String, dynamic>;
        _events = results[1] as List<dynamic>;
        _podcasts = results[2] as Map<String, dynamic>;
        _broadcast = results[3] as Map<String, dynamic>;
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
    final session = context.watch<SessionController>();
    final name = session.user?.firstName.trim().isNotEmpty == true
        ? session.user!.firstName.trim()
        : (session.user?.displayName.split(' ').first ?? '');
    final live = str(asMap(_broadcast['broadcast'])['status']) == 'live';
    final tiles = <Widget>[
      FeatureTile(
        icon: Icons.event_outlined,
        label: 'Мероприятия',
        tone: Tone.green,
        centered: true,
        onTap: () => pushPage(context, const EventsPage()),
      ),
      if (session.canOpen('songbook'))
        FeatureTile(
          icon: Icons.library_music_outlined,
          label: 'Песенник',
          tone: Tone.rose,
          centered: true,
          onTap: () => pushPage(context, const SongbookPage()),
        ),
      if (session.canOpen('sermons') || session.user?.isPreacher == true)
        FeatureTile(
          icon: Icons.mic_none_rounded,
          label: 'Проповеди',
          tone: Tone.teal,
          centered: true,
          onTap: () => pushPage(context, const SermonsPage()),
        ),
      if (session.canOpen('bible'))
        FeatureTile(
          icon: Icons.menu_book_outlined,
          label: 'Библия',
          tone: Tone.amber,
          centered: true,
          onTap: () => pushPage(context, const BiblePage()),
        ),
      FeatureTile(
        icon: Icons.videocam_outlined,
        label: 'Трансляция',
        tone: Tone.red,
        centered: true,
        badge: live ? 'LIVE' : null,
        onTap: () => pushPage(context, const BroadcastPage()),
      ),
      FeatureTile(
        icon: Icons.favorite_border_rounded,
        label: 'Моя нужда',
        tone: Tone.violet,
        centered: true,
        onTap: () => pushPage(context, const ProfilePage(focusNeed: true)),
      ),
    ];
    return ChurchPage(
      title: 'Главная',
      subtitle: name.isEmpty
          ? DateFormat('EEEE, d MMMM', 'ru').format(DateTime.now())
          : 'Здравствуйте, $name · ${DateFormat('EEEE, d MMMM', 'ru').format(DateTime.now())}',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: ListenableBuilder(
          listenable: Listenable.merge([_extras, _extras.notesController]),
          builder: (context, _) => SheetList(
          onRefresh: _load,
          children: [
            TileGrid(children: tiles),
            if (live) _LiveCard(broadcast: asMap(_broadcast['broadcast'])),
            ..._notes(session),
            const SectionLabel('Молитва сегодня'),
            _PrayerCard(day: _day),
            ..._coordinator(session),
            ..._birthdays(),
            ..._nextEvent(context),
            ..._latestSermon(context),
          ],
          ),
        ),
      ),
    );
  }

  /// Срочная нужда и объявление от координаторов; править может только тот, кому разрешено.
  List<Widget> _notes(SessionController session) {
    final access = PrayerAccess(session.user);
    final notes = _extras.notes;
    final today = DateTime.now();
    return [
      if (notes.urgent != null)
        NoteCard(
          kind: NoteKind.urgentPrayer,
          note: notes.urgent!,
          onEdit: access.canManageNotes ? () => _editNote(NoteKind.urgentPrayer) : null,
          onDelete: access.canManageNotes
              ? () => deleteNoteWithConfirm(context, _extras.notesController, NoteKind.urgentPrayer, today)
              : null,
        ),
      if (notes.announcement != null)
        NoteCard(
          kind: NoteKind.announcement,
          note: notes.announcement!,
          onEdit: access.canManageNotes ? () => _editNote(NoteKind.announcement) : null,
          onDelete: access.canManageNotes
              ? () => deleteNoteWithConfirm(context, _extras.notesController, NoteKind.announcement, today)
              : null,
        ),
    ];
  }

  List<Widget> _coordinator(SessionController session) {
    final summary = _extras.coordinator;
    if (summary == null) return const [];
    return [
      CoordinatorSummaryCard(
        summary: summary,
        meId: session.user?.id ?? 0,
        onOpen: () => pushPage(context, CollectionPage(initialKind: summary.week)).then((_) {
          if (mounted) _extras.load(DateTime.now());
        }),
      ),
    ];
  }

  List<Widget> _birthdays() {
    if (_extras.birthdays.isEmpty) return const [];
    return [
      const SectionLabel('Дни рождения'),
      BirthdaysCard(birthdays: _extras.birthdays, now: DateTime.now(), onMessage: _message),
    ];
  }

  List<Widget> _nextEvent(BuildContext context) {
    Map<String, dynamic>? next;
    final today = DateTime.now();
    final start = DateTime(today.year, today.month, today.day);
    for (final raw in _events) {
      final item = asMap(raw);
      final date = parseApiDate(item['event_date']);
      if (date != null && date.isBefore(start)) continue;
      if (asBool(item['is_active']) || str(item['is_active']).isEmpty) {
        next = item;
        break;
      }
    }
    final date = next == null ? null : parseApiDate(next['event_date']);
    return [
      const SectionLabel('Ближайшее событие'),
      ChurchCard(
        onTap: () => pushPage(context, const EventsPage()),
        child: next == null
            ? Row(
                children: [
                  const IconTile(Icons.event_busy_outlined, tone: Tone.neutral),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Text(
                      'Ближайших событий нет',
                      style: ChurchType.title.copyWith(color: context.palette.inkMuted),
                    ),
                  ),
                ],
              )
            : Row(
                children: [
                  if (date != null) DateBadge(date: date) else const IconTile(Icons.event_outlined, tone: Tone.green),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(str(next['title']), style: ChurchType.title.copyWith(fontSize: 16, color: context.palette.ink)),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (date != null) dayMonth(date),
                            shortTime(next['event_time']),
                          ].where((part) => part.isNotEmpty).join(' · '),
                          style: ChurchType.caption.copyWith(color: context.palette.inkMuted),
                        ),
                        if (str(next['description']).isNotEmpty)
                          Text(
                            str(next['description']),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ChurchType.caption.copyWith(color: context.palette.inkMuted),
                          ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: context.palette.chevron),
                ],
              ),
      ),
    ];
  }

  List<Widget> _latestSermon(BuildContext context) {
    final episodes = asList(_podcasts['episodes']);
    if (episodes.isEmpty) return const [];
    final episode = asMap(episodes.first);
    final url = str(episode['audioUrl']);
    final when = parseApiDate(episode['pubDate']);
    final length = durationLabel(asInt(episode['duration']));
    return [
      const SectionLabel('Последняя проповедь'),
      ChurchCard(
        onTap: () => pushPage(context, const SermonsPage()),
        child: Row(
          children: [
            const ChurchLogo(size: 56),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    str(episode['title']),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ChurchType.title.copyWith(color: context.palette.ink),
                  ),
                  if (when != null || length.isNotEmpty)
                    Text(
                      [if (when != null) dayMonth(when), length].where((part) => part.isNotEmpty).join(' · '),
                      style: ChurchType.caption.copyWith(color: context.palette.inkFaint),
                    ),
                ],
              ),
            ),
            if (url.isNotEmpty)
              IconButton.filled(
                tooltip: 'Слушать',
                style: IconButton.styleFrom(backgroundColor: ChurchColors.wine, foregroundColor: Colors.white),
                onPressed: () => pushPage(context, AudioPlayerPage(url: url, title: str(episode['title']))),
                icon: const Icon(Icons.play_arrow_rounded),
              ),
          ],
        ),
      ),
    ];
  }
}

/// Карточка «Молитва сегодня» в стиле карточки богослужения из макета.
class _PrayerCard extends StatelessWidget {
  const _PrayerCard({required this.day});
  final Map<String, dynamic> day;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final members = asList(day['members']);
    final member = members.isEmpty ? <String, dynamic>{} : asMap(members.first);
    final themes = asList(day['global_themes']);
    final theme = themes.isEmpty ? <String, dynamic>{} : asMap(themes.first);
    final who = str(member['name']);
    final need = str(member['prayer_request']);
    final themeTitle = str(theme['title']);
    final body = palette.isDark ? palette.accentSoft : const Color(0xFFF6EDE0);
    return ChurchCard(
      padding: EdgeInsets.zero,
      onTap: () => pushPage(context, const PrayerPage()),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: const BoxDecoration(gradient: wineGradient),
            // Wrap: при крупном шрифте на узком экране дата уходит на вторую строку, а не за край.
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.church_outlined, size: 16, color: ChurchColors.amber),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'МОЛИТВЕННЫЙ ЦИКЛ',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1.4, color: Colors.white),
                      ),
                    ),
                  ],
                ),
                Text(
                  DateFormat('EE, d MMMM', 'ru').format(DateTime.now()),
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xCCFFFFFF)),
                ),
              ],
            ),
          ),
          Container(
            color: body,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ChurchAvatar(name: who.isEmpty ? '?' : who, size: 48),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'МОЛИМСЯ ЗА ЧЛЕНА ЦЕРКВИ',
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: palette.inkFaint),
                          ),
                          Text(
                            who.isEmpty ? 'Пока не назначен' : who,
                            style: ChurchType.serifTitle.copyWith(fontSize: 20, color: palette.ink),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (need.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(need, style: ChurchType.body.copyWith(color: palette.inkMuted, fontSize: 14)),
                ],
                if (themeTitle.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: Divider(height: 1, color: palette.outline),
                  ),
                  Text(
                    '«$themeTitle»',
                    style: ChurchType.serifTitle.copyWith(fontSize: 22, color: palette.ink),
                  ),
                ],
                if (str(theme['bible_verse']).isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: palette.card,
                      borderRadius: BorderRadius.circular(Radii.sm),
                      border: Border.all(color: palette.outline),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.menu_book_outlined, size: 14, color: palette.accent),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            str(theme['bible_verse']).split(':').first,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: palette.accent),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveCard extends StatelessWidget {
  const _LiveCard({required this.broadcast});
  final Map<String, dynamic> broadcast;

  @override
  Widget build(BuildContext context) {
    return ChurchCard(
      padding: EdgeInsets.zero,
      onTap: () => pushPage(context, const BroadcastPage()),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF6C1E32), Color(0xFF2A0B15)],
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _LivePill(),
                  const SizedBox(height: 10),
                  Text(
                    str(broadcast['title']).isEmpty ? 'Трансляция' : str(broadcast['title']),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const SizedBox(height: 2),
                  const Text('Сейчас в эфире — откройте, чтобы смотреть', style: TextStyle(fontSize: 12.5, color: Color(0xC7FFFFFF))),
                ],
              ),
            ),
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
              ),
              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 30),
            ),
          ],
        ),
      ),
    );
  }
}

class _LivePill extends StatelessWidget {
  const _LivePill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: ChurchColors.danger, borderRadius: BorderRadius.circular(99)),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.circle, size: 7, color: Colors.white),
          SizedBox(width: 5),
          Text('В ЭФИРЕ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Colors.white)),
        ],
      ),
    );
  }
}
