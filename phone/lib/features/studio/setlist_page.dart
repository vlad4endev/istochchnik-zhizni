import '../../core/http_cache.dart';
import '../../core/cache_watch.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../schedule/logic/schedule_labels.dart';
import '../songbook/data/songbook_repository.dart';
import '../songbook/models/song.dart';
import 'data/studio_repository.dart';
import 'models/studio_models.dart';
import 'setlist_player_page.dart';
import 'studio_controllers.dart';
import 'widgets/song_picker.dart';

/// Один сетлист: порядок песен, «Играть», добавление, название, дата и ссылка для команды.
class SetlistPage extends StatefulWidget {
  const SetlistPage({
    super.key,
    required this.setlist,
    required this.source,
    this.onChanged,
    this.loadSongs,
    this.userId,
    this.origin,
  });

  final Setlist setlist;
  final StudioSource source;

  /// Список за экраном должен узнать о новом названии и дате.
  final ValueChanged<Setlist>? onChanged;

  /// Для тестов: песни песенника и владелец без сессии.
  final Future<List<Song>> Function()? loadSongs;
  final int? userId;
  final String? origin;

  @override
  State<SetlistPage> createState() => _SetlistPageState();
}

class _SetlistPageState extends State<SetlistPage> with CacheWatcher<SetlistPage> {
  late final SetlistController _c;
  Map<int, MyVersion>? _versions;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _c = SetlistController(
      widget.source,
      initial: widget.setlist,
      userId: widget.userId ?? session.user?.id ?? 0,
      origin: widget.origin ?? session.apiOrigin,
    )..load();
    watchCache(const ['/api/studio/setlists'], _c.load);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, {String? ok}) async {
    try {
      await action();
      widget.onChanged?.call(_c.setlist);
      if (ok != null && mounted) showMessage(context, ok);
    } catch (error) {
      if (mounted) {
        showMessage(context, 'Не удалось сохранить: ${describeDio(error)}');
      }
    }
  }

  Future<List<Song>> _songs() async {
    if (widget.loadSongs != null) return widget.loadSongs!();
    final repo = SongbookRepository(context.read<SessionController>());
    final cached = (await repo.readCache())?.songs ?? const <Song>[];
    return cached.isNotEmpty ? cached : repo.fetch();
  }

  Future<Map<int, MyVersion>> _myVersions() async => _versions ??= {
    for (final v in await widget.source.myVersions()) v.songId: v,
  };

  Future<void> _add() => showSongPicker(
    context,
    loadSongs: _songs,
    loadVersions: _myVersions,
    alreadyIn: {for (final i in _c.items) i.songId},
    onAdd: (song, version) =>
        _c.addSong(song.id, versionId: version?.versionId),
  );

  void _play(int start) {
    final items = _c.items;
    if (items.isEmpty) return;
    pushPage(context, SetlistPlayerPage(items: items, start: start));
  }

  Future<void> _remove(SetlistItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Убрать песню из сетлиста?'),
        content: Text('«${item.title}» останется в песеннике.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Оставить'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Убрать'),
          ),
        ],
      ),
    );
    if (ok == true) await _run(() => _c.remove(item));
  }

  Future<void> _rename() async {
    final controller = TextEditingController(text: _c.setlist.title);
    final title = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Название сетлиста'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          maxLength: 120,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (title != null && title.isNotEmpty) await _run(() => _c.rename(title));
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _c.setlist.date ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(DateTime.now().year + 3),
      helpText: 'Дата сетлиста',
    );
    if (picked != null) await _run(() => _c.setDate(picked));
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить сетлист?'),
        content: Text(
          '«${_c.setlist.displayTitle}» удалится вместе со списком песен. Сами песни останутся.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _c.deleteSetlist();
      if (mounted) Navigator.pop(context, 'deleted');
    } catch (error) {
      if (mounted) {
        showMessage(context, 'Не удалось удалить: ${describeDio(error)}');
      }
    }
  }

  void _share() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _ShareSheet(controller: _c, onRun: _run),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final s = _c.setlist;
        return ChurchPage(
          title: s.displayTitle,
          subtitle: s.date == null
              ? 'Без даты'
              : '${friendlyDay(s.date!, DateTime.now())} · ${longDate(s.date!)}',
          actions: [
            HeaderButton(
              icon: Icons.ios_share_rounded,
              tooltip: 'Ссылка для команды',
              onPressed: _share,
            ),
            if (_c.editable)
              PopupMenuButton<String>(
                tooltip: 'Ещё',
                icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
                onSelected: (v) => switch (v) {
                  'rename' => _rename(),
                  'date' => _pickDate(),
                  'nodate' => _run(() => _c.setDate(null)),
                  _ => _delete(),
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'rename',
                    child: Text('Переименовать'),
                  ),
                  const PopupMenuItem(
                    value: 'date',
                    child: Text('Изменить дату'),
                  ),
                  if (s.date != null)
                    const PopupMenuItem(
                      value: 'nodate',
                      child: Text('Убрать дату'),
                    ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text('Удалить сетлист'),
                  ),
                ],
              ),
          ],
          body: _body(),
        );
      },
    );
  }

  Widget _body() {
    if (_c.loading) return const LoadingView();
    if (_c.error != null && _c.items.isEmpty) {
      return ErrorView(message: _c.error!, onRetry: _c.load);
    }
    final palette = context.palette;
    final items = _c.items;
    final canEdit = _c.editable;
    return RefreshIndicator(
      color: palette.accent,
      onRefresh: () => HttpCache.fresh(_c.load),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          Space.lg,
          16,
          Space.lg,
          32 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          if (_c.staleSince != null)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: InfoBanner(
                'Нет связи — сетлист сохранён ${relativeTime(_c.staleSince!.toIso8601String())}. Играть можно, менять — после появления сети.',
              ),
            ),
          if (_c.setlist.fromServicePlan && !_c.canEdit)
            const Padding(
              padding: EdgeInsets.only(bottom: Space.md),
              child: InfoBanner(
                'Сетлист создан из программы служения. Его можно смотреть и играть; менять может автор.',
              ),
            ),
          PrimaryButton(
            label: 'Играть сетлист',
            icon: Icons.play_arrow_rounded,
            height: 54,
            onPressed: items.isEmpty ? null : () => _play(0),
          ),
          const SizedBox(height: Space.lg),
          if (items.isEmpty)
            EmptyHint(
              'В сетлисте нет песен',
              icon: Icons.music_off_outlined,
              hint: canEdit
                  ? 'Добавьте песни из песенника — они появятся здесь в нужном порядке.'
                  : null,
            )
          else
            ChurchCard(
              padding: EdgeInsets.zero,
              child: ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: items.length,
                // onReorderItem уже учитывает удаление из старой позиции; контроллер ждёт индекс «до удаления».
                onReorderItem: (from, to) =>
                    _run(() => _c.move(from, to > from ? to + 1 : to)),
                itemBuilder: (context, i) => _ItemRow(
                  key: ValueKey(items[i].id),
                  item: items[i],
                  index: i,
                  canEdit: canEdit,
                  onTap: () => _play(i),
                  onRemove: () => _remove(items[i]),
                ),
              ),
            ),
          if (canEdit) ...[
            const SizedBox(height: Space.lg),
            SecondaryButton(
              label: 'Добавить песню',
              icon: Icons.add_rounded,
              onPressed: _add,
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    super.key,
    required this.item,
    required this.index,
    required this.canEdit,
    required this.onTap,
    required this.onRemove,
  });

  final SetlistItem item;
  final int index;
  final bool canEdit;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final facts = [
      if (item.key != null) item.key!,
      if (item.tempo != null) '${item.tempo} BPM',
      if (item.versionId != null) 'моя версия',
      if (!item.notes.isEmpty) 'есть заметки',
      if (!item.hasText) 'нет текста',
    ].join(' · ');
    return Material(
      color: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (index > 0)
            Divider(height: 1, indent: 64, color: palette.hairline),
          InkWell(
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 64),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 4, 8),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: palette.accentSoft,
                        borderRadius: BorderRadius.circular(Radii.sm),
                      ),
                      child: Text(
                        '${index + 1}',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: palette.accent,
                        ),
                      ),
                    ),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                              color: palette.ink,
                            ),
                          ),
                          if (facts.isNotEmpty)
                            Text(
                              facts,
                              maxLines: 2,
                              style: ChurchType.caption.copyWith(
                                color: palette.inkMuted,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (canEdit) ...[
                      IconButton(
                        tooltip: 'Убрать «${item.title}» из сетлиста',
                        onPressed: onRemove,
                        icon: Icon(
                          Icons.remove_circle_outline_rounded,
                          color: palette.inkFaint,
                        ),
                      ),
                      ReorderableDragStartListener(
                        index: index,
                        child: Semantics(
                          label: 'Перетащить «${item.title}»',
                          child: SizedBox(
                            width: 44,
                            height: 48,
                            child: Icon(
                              Icons.drag_handle_rounded,
                              color: palette.chevron,
                            ),
                          ),
                        ),
                      ),
                    ] else
                      Padding(
                        padding: const EdgeInsets.only(right: 10),
                        child: Icon(
                          Icons.chevron_right_rounded,
                          color: palette.chevron,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ShareSheet extends StatelessWidget {
  const _ShareSheet({required this.controller, required this.onRun});

  final SetlistController controller;
  final Future<void> Function(Future<void> Function() action, {String? ok})
  onRun;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final c = controller;
        return Container(
          decoration: BoxDecoration(
            color: palette.sheet,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(Radii.sheet),
            ),
          ),
          padding: EdgeInsets.fromLTRB(
            20,
            16,
            20,
            20 + MediaQuery.paddingOf(context).bottom,
          ),
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    'Ссылка для команды',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: palette.ink,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  c.setlist.isPublic
                      ? 'Любой, у кого есть ссылка, увидит список песен без входа в приложение.'
                      : 'Сейчас сетлист виден только вам и команде программы. Включите доступ по ссылке, чтобы поделиться им.',
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.4,
                    color: palette.inkMuted,
                  ),
                ),
                if (c.canEdit) ...[
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Доступ по ссылке',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    value: c.setlist.isPublic,
                    onChanged: c.staleSince != null
                        ? null
                        : (v) => onRun(() => c.setPublic(v)),
                  ),
                ],
                if (c.setlist.isPublic && c.shareUrl.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  PrimaryButton(
                    label: 'Скопировать ссылку',
                    icon: Icons.link_rounded,
                    height: 50,
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: c.shareUrl));
                      if (context.mounted) {
                        Navigator.pop(context);
                        showMessage(context, 'Ссылка скопирована');
                      }
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
