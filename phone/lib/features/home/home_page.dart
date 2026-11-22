import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/audio_player_page.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../bible/bible_page.dart';
import '../broadcast/broadcast_page.dart';
import '../chats/thread_page.dart';
import '../events/events_page.dart';
import '../prayer/collection_page.dart';
import '../prayer/data/prayer_source.dart';
import '../prayer/logic/prayer_access.dart';
import '../prayer/models/prayer_models.dart';
import '../prayer/prayer_controllers.dart';
import '../prayer/prayer_page.dart';
import '../prayer/widgets/home_blocks.dart';
import '../prayer/widgets/note_card.dart';
import '../prayer/widgets/note_editor.dart';
import '../prayer/widgets/note_menu.dart';
import '../prayer/widgets/share_need_sheet.dart';
import '../prayer/widgets/sheet_frame.dart';
import '../schedule/data/schedule_repository.dart';
import '../schedule/schedule_page.dart';
import '../sermons/sermons_page.dart';
import 'data/home_source.dart';
import 'home_controller.dart';
import 'logic/home_logic.dart';
import 'models/home_models.dart';
import 'widgets/event_sheet.dart';
import 'widgets/home_cards.dart';
import 'widgets/my_service_week.dart';
import 'widgets/service_card.dart';

/// Главная — по образцу мобильной версии сайта: три кнопки, дни рождения, «Богослужение»,
/// «Твоё служение», объявление, «Молимся сегодня», трансляция, «Медиа», «Мероприятия»,
/// блок координатора и кнопка «+».
class HomePage extends StatefulWidget {
  const HomePage({super.key, this.homeSource, this.scheduleSource, this.prayerSource});

  /// Для тестов; в приложении берутся из сессии.
  final HomeSource? homeSource;
  final ScheduleSource? scheduleSource;
  final PrayerSource? prayerSource;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with CacheWatcher<HomePage> {
  late final HomeController _home;
  late final HomeExtrasController _extras;
  Timer? _tick;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    final meId = session.user?.id ?? 0;
    _home = HomeController(
      widget.homeSource ?? HomeApi(session),
      widget.scheduleSource ?? ScheduleRepository(session),
      meId: meId,
    );
    _extras = HomeExtrasController(
      widget.prayerSource ?? PrayerApi(session),
      access: PrayerAccess(session.user),
      meId: meId,
    );
    _reload();
    // Свежее, пришедшее фоном (расписание, события, эфир), сразу попадает на главную.
    watchCache(const ['/api/calendar', '/api/resources', '/api/broadcasts', '/api/service-plans', '/api/sunday-schedule', '/api/media-schedule', '/api/music-schedule', '/api/profile'], _reload);
    // Раз в полминуты пересчитываем «сегодня/завтра», фазы служения и показ трансляции.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _home.dispose();
    _extras.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _now = DateTime.now();
    unawaited(_extras.load(_now));
    await _home.load();
  }

  SessionController get _session => context.read<SessionController>();

  Future<void> _editNote(NoteKind kind) async {
    final changed = await showNoteEditor(context, _extras.notesController, kind, DateTime.now());
    if (changed && mounted) _extras.notesController.load(DateTime.now());
  }

  Future<void> _openNoteMenu() async {
    final kind = await showNoteMenu(context, _extras.notes);
    if (kind != null && mounted) await _editNote(kind);
  }

  Future<void> _chat(int memberId, String name) async {
    try {
      final id = await ChurchApi(_session).openPersonal(memberId);
      if (!mounted || id.isEmpty) return;
      await pushPage(context, ThreadPage(conversationId: id, title: name, otherMemberId: memberId));
    } catch (error) {
      if (mounted) showMessage(context, actionError(error));
    }
  }

  Future<void> _rate(ServiceCardData data) async {
    final token = data.shareToken;
    if (token.isEmpty) return;
    final uri = Uri.tryParse('${_session.apiOrigin}/service-plan/sermon-comments/$token');
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _openEvent(HomeEvent event) {
    showEventSheet(
      context,
      event,
      resolveUrl: (raw) => resolveUrl(_session.apiOrigin, raw),
      onCalendar: () => pushPage(context, const EventsPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final access = PrayerAccess(session.user);
    return ChurchPage(
      title: 'Главная',
      floatingActionButton: access.canManageNotes
          ? ChurchFab(circle: true, tooltip: 'Срочная нужда и объявление: добавить или изменить', onPressed: _openNoteMenu)
          : null,
      body: ListenableBuilder(
        listenable: Listenable.merge([_home, _extras, _extras.notesController]),
        builder: (context, _) => AsyncBody(
          loading: _home.loading,
          error: _home.error,
          onRetry: _reload,
          child: SheetList(
            onRefresh: _reload,
            // Запас снизу: кнопка «+» не должна закрывать последнюю карточку.
            padding: EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, access.canManageNotes ? 96 : 32),
            children: _sections(session, access),
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(SessionController session, PrayerAccess access) {
    final user = session.user;
    final guest = user?.role == 'parishioner';
    final meId = user?.id ?? 0;
    final service = _home.service;
    final notes = _extras.notes;
    final day = _home.day;
    final members = asList(day['members']);
    final memberName = members.isEmpty ? null : str(asMap(members.first)['name']);
    final episode = latestEpisode(_home.episodes);
    final event = pickUpcomingEvent(_now, _home.events);
    final myService = _home.myService;
    return [
      QuickActionsStrip(
        actions: [
          QuickAction(label: 'Мероприятия', icon: Icons.date_range_outlined, tone: Tone.green, onTap: () => pushPage(context, const EventsPage())),
          if (!guest)
            QuickAction(
              label: 'Отправить нужду',
              icon: Icons.volunteer_activism_outlined,
              tone: Tone.rose,
              onTap: () => showShareNeedSheet(context, _extras.source, user),
            ),
          QuickAction(label: 'Проповеди', icon: Icons.mic_none_rounded, tone: Tone.teal, onTap: () => pushPage(context, const SermonsPage())),
        ],
      ),
      if (_extras.birthdays.isNotEmpty)
        BirthdaysCard(birthdays: _extras.birthdays, now: _now, onMessage: (b) => _chat(b.id, b.name)),
      if (service != null)
        ServiceCard(
          data: service,
          currentMemberId: meId,
          onChat: (p) => _chat(p.id, p.name),
          onScripture: () => pushPage(context, const BiblePage()),
          onRate: () => _rate(service),
        ),
      if (myService.isNotEmpty)
        MyServiceWeek(
          cards: myService,
          answering: _home.answering,
          error: _home.answerError,
          onAnswer: _home.answer,
          onOpen: () => pushPage(context, const SchedulePage()),
        ),
      if (notes.urgent != null && !guest)
        NoteCard(
          kind: NoteKind.urgentPrayer,
          note: notes.urgent!,
          onEdit: access.canManageNotes ? () => _editNote(NoteKind.urgentPrayer) : null,
          onDelete: access.canManageNotes ? () => deleteNoteWithConfirm(context, _extras.notesController, NoteKind.urgentPrayer, DateTime.now()) : null,
        ),
      if (notes.announcement != null && !guest)
        NoteCard(
          kind: NoteKind.announcement,
          note: notes.announcement!,
          onEdit: access.canManageNotes ? () => _editNote(NoteKind.announcement) : null,
          onDelete: access.canManageNotes ? () => deleteNoteWithConfirm(context, _extras.notesController, NoteKind.announcement, DateTime.now()) : null,
        ),
      if (!guest) PrayerTodayCard(now: _now, memberName: memberName, onTap: () => pushPage(context, const PrayerPage())),
      if (showBroadcast(_now, _home.broadcast))
        BroadcastCard(broadcast: _home.broadcast!, onOpen: () => pushPage(context, const BroadcastPage())),
      MediaCard(
        episode: episode,
        onPlay: episode == null || episode.audioUrl.isEmpty ? null : () => pushPage(context, AudioPlayerPage(url: episode.audioUrl, title: episode.title)),
      ),
      EventCard(event: event, onTap: () => _openEvent(event)),
      if (_extras.coordinator != null)
        CoordinatorSummaryCard(
          summary: _extras.coordinator!,
          meId: meId,
          onOpen: () => pushPage(context, CollectionPage(initialKind: _extras.coordinator!.week)).then((_) {
            if (mounted) _extras.load(DateTime.now());
          }),
        ),
    ];
  }
}
