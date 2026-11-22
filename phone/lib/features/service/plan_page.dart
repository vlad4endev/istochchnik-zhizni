import '../../core/cache_watch.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../bible/open_bible.dart';
import '../schedule/schedule_controller.dart' show dateOnly;
import '../songbook/data/songbook_repository.dart';
import '../songbook/song_reader_page.dart';
import 'data/plan_repository.dart';
import 'logic/plan_logic.dart';
import 'models/plan_models.dart';
import 'widgets/plan_widgets.dart';

/// Программа одного служения: ход по времени, мои блоки, песни и Писание — в одно нажатие.
class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.summary, required this.source, this.songTitles});

  final PlanSummary summary;
  final PlanSource source;

  /// Названия песен из песенника на телефоне. Для тестов; по умолчанию читается копия песенника.
  final Future<Map<int, ({String title, String key})>> Function()? songTitles;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> with CacheWatcher<PlanPage> {
  bool _loading = true;
  String? _error;
  PlanView? _plan;
  DateTime? _stale;
  int? _songBusy;

  @override
  void initState() {
    super.initState();
    _load();
    watchCache(const ['/api/service-plans'], _load);
  }

  Future<void> _load() async {
    setState(() {
      _loading = _plan == null;
      _error = null;
    });
    try {
      final result = await widget.source.view(widget.summary);
      final plan = await _withSongTitles(result.value);
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _stale = result.staleSince;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = isNotFound(error) ? 'Эту программу удалили или она больше недоступна.' : describeDio(error);
      });
    }
  }

  /// Если в программе нет названий песен, берём их из песенника на телефоне (без сети).
  Future<Map<int, ({String title, String key})>> _songsFromCache() async {
    final songs = (await SongbookRepository(context.read<SessionController>()).readCache())?.songs ?? const [];
    return {for (final s in songs) s.id: (title: s.title, key: s.key ?? '')};
  }

  Future<PlanView> _withSongTitles(PlanView plan) async {
    if (!plan.blocks.any((b) => b.songId != null && b.songTitle.isEmpty)) return plan;
    try {
      final loader = widget.songTitles ?? _songsFromCache;
      // Программа должна открыться, даже если файл песенника читается медленно.
      return fillSongTitles(plan, await loader().timeout(const Duration(seconds: 3)));
    } catch (_) {
      return plan;
    }
  }

  Future<void> _copy(PlanView plan) async {
    await Clipboard.setData(ClipboardData(text: programText(plan)));
    if (mounted) showMessage(context, 'Программа скопирована — можно отправить в чат');
  }

  Future<void> _openSong(PlanBlock block) async {
    final id = block.songId;
    if (id == null) return;
    final session = context.read<SessionController>();
    setState(() => _songBusy = block.id);
    try {
      final repo = SongbookRepository(session);
      var songs = (await repo.readCache())?.songs ?? const [];
      var song = songs.where((s) => s.id == id).firstOrNull;
      if (song == null) {
        songs = await repo.fetch();
        song = songs.where((s) => s.id == id).firstOrNull;
      }
      if (!mounted) return;
      if (song == null) {
        showMessage(context, 'Этой песни нет в песеннике.');
      } else {
        await pushPage(context, SongReaderPage(song: song, source: repo));
      }
    } catch (_) {
      if (mounted) showMessage(context, 'Не удалось открыть песню — проверьте интернет.');
    } finally {
      if (mounted) setState(() => _songBusy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.summary;
    final plan = _plan;
    return ChurchPage(
      title: '${weekdayName(s.date)[0].toUpperCase()}${weekdayName(s.date).substring(1)}, ${dayMonth(s.date)}',
      subtitle: s.title,
      actions: [
        if (plan != null) HeaderButton(icon: Icons.copy_rounded, tooltip: 'Скопировать программу', onPressed: () => _copy(plan)),
      ],
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: plan == null ? const SizedBox.shrink() : _content(plan),
      ),
    );
  }

  Widget _content(PlanView plan) {
    final palette = context.palette;
    final me = context.read<SessionController>().user?.id ?? 0;
    final s = plan.summary;
    final timeline = Timeline.of(s.startTime, plan.blocks);
    final today = dateOnly(DateTime.now());
    final isToday = s.date == today;
    return SheetList(
      onRefresh: _load,
      gap: Space.md,
      children: [
        if (_stale != null) InfoBanner('Нет связи — программа сохранена ${relativeTime(_stale!.toIso8601String())}'),
        if (!s.published) const InfoBanner('Программа ещё в работе — состав и порядок могут измениться.'),
        if (!plan.namesComplete) const InfoBanner('Часть названий песен и имён сейчас недоступна. Потяните вниз, чтобы обновить.'),
        PlanHeaderCard(plan: plan, timeline: timeline, meId: me),
        if (plan.notes.isNotEmpty) ChurchCard(padding: const EdgeInsets.all(14), child: Text(plan.notes, style: TextStyle(fontSize: 14.5, height: 1.45, color: palette.ink))),
        const SectionLabel('Ход служения'),
        if (plan.blocks.isEmpty)
          const EmptyHint('В программе пока нет блоков', icon: Icons.view_agenda_outlined)
        else
          Column(
            children: [
              for (var i = 0; i < plan.blocks.length; i++)
                Builder(builder: (context) {
                  final b = plan.blocks[i];
                  final d = detailsOf(b);
                  final scripture = d.scripture.isEmpty ? null : firstBibleRef(d.scripture);
                  return TimelineBlock(
                    block: b,
                    details: d,
                    start: timeline.starts.isEmpty ? null : timeline.starts[i],
                    mine: me > 0 && (b.assignedId == me || (b.kind == BlockKind.sermon && s.preacherId == me)),
                    current: isToday && s.currentBlockId == b.id,
                    first: i == 0,
                    last: i == plan.blocks.length - 1,
                    songBusy: _songBusy == b.id,
                    onSong: b.songId == null ? null : () => _openSong(b),
                    onScripture: scripture == null ? null : () => openBibleAt(context, scripture),
                  );
                }),
            ],
          ),
        if (plan.sermon != null) ...[
          const SectionLabel('Проповедь'),
          _SermonCard(sermon: plan.sermon!),
        ],
        if (plan.broadcast.isNotEmpty) ...[
          const SectionLabel('Команда трансляции'),
          BroadcastCard(people: plan.broadcast),
        ],
        SecondaryButton(label: 'Скопировать программу', icon: Icons.copy_rounded, onPressed: () => _copy(plan)),
      ],
    );
  }
}

class _SermonCard extends StatelessWidget {
  const _SermonCard({required this.sermon});
  final LinkedSermon sermon;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ref = sermon.scripture.isEmpty ? null : firstBibleRef(sermon.scripture);
    final title = sermon.topic.isNotEmpty ? sermon.topic : sermon.title;
    return ChurchCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const IconTile(Icons.mic_none_rounded, tone: Tone.teal),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: palette.ink)),
                      if (sermon.author.isNotEmpty) Text(sermon.author, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (sermon.scripture.isNotEmpty) ...[
            Divider(height: 1, color: palette.hairline),
            InkWell(
              onTap: ref == null ? null : () => openBibleAt(context, ref),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 52),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Row(
                    children: [
                      Icon(Icons.menu_book_outlined, size: 20, color: ref == null ? palette.inkFaint : palette.accent),
                      const SizedBox(width: 10),
                      Expanded(child: Text(sermon.scripture, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: ref == null ? palette.ink : palette.accent))),
                      if (ref != null) Icon(Icons.chevron_right_rounded, color: palette.accent),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
