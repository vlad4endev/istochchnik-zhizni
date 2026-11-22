import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/push.dart';
import '../../core/drafts.dart';
import '../../core/presence.dart';
import '../../core/realtime.dart';
import '../../core/typing.dart';
import '../../core/session.dart';
import '../../core/unread_badge.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../calls/call_page.dart';
import '../calls/join_meeting_page.dart';
import '../prayer/widgets/sheet_frame.dart' show actionError;
import 'chat_profile_page.dart';
import 'data/attachment_picker.dart';
import 'widgets/message_search.dart';
import 'logic/mentions.dart';
import 'logic/voice.dart';
import 'logic/selection.dart';
import 'widgets/pinned_bar.dart';
import 'widgets/scroll_down_button.dart';
import 'data/chat_source.dart';
import 'logic/attachment_logic.dart';
import 'logic/chat_logic.dart';
import 'models/chat_models.dart';
import 'thread_controller.dart';
import 'widgets/chat_sheets.dart';
import 'widgets/composer.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_menu.dart';

class ThreadPage extends StatefulWidget {
  const ThreadPage({
    super.key,
    required this.conversationId,
    required this.title,
    this.otherMemberId,
    this.avatarUrl,
    this.lastSeen,
    this.type = 'private',
    this.muted = false,
    this.source,
    this.events,
    this.picker,
    this.instantClose = const Duration(milliseconds: 1500),
    this.jumpToMessageId,
    this.unreadCount = 0,
    this.voiceBackend,
  });

  final String conversationId;
  final String title;
  final int? otherMemberId;
  final String? avatarUrl;

  /// ISO-время последнего входа собеседника — для подписи в шапке.
  final String? lastSeen;

  /// `private`, `group` или `channel`: в группах показываем авторов и аватары.
  final String type;
  final bool muted;

  /// Для тестов; в приложении берутся из сессии.
  final ChatSource? source;
  final Stream<Map<String, dynamic>>? events;
  final AttachmentPicker? picker;

  /// Для тестов: микрофон подменяется; в приложении — пакет `record`.
  final VoiceBackend? voiceBackend;

  /// Сколько сообщений было не прочитано при открытии: к первому из них чат прокрутится, перед ним будет «Новые сообщения».
  final int unreadCount;

  /// Открыть чат сразу на этом сообщении (из поиска по всем чатам).
  final String? jumpToMessageId;

  /// Если окно выбора закрылось быстрее и ничего не вернуло — считаем, что оно не сработало.
  final Duration instantClose;

  @override
  State<ThreadPage> createState() => _ThreadPageState();
}

class _ThreadPageState extends State<ThreadPage> with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  late final ChatSource _source;
  late final PresenceStore _presence;
  late final TypingStore _typing;
  late final ChurchRealtime _realtime;
  int _pinnedIndex = 0;
  final Set<String> _selected = {};
  bool _showDown = false;
  bool _unreadResolved = false;
  String? _firstUnreadId;

  /// Последнее сообщение, которое видели, когда чат был прокручен вниз; всё, что пришло позже, — «новое».
  String? _bottomLatestId;
  String? _highlightId;
  Timer? _highlightTimer;
  DateTime _typingSentAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool _typingSent = false;
  late final AttachmentPicker _picker = widget.picker ?? DeviceAttachmentPicker();
  late final ThreadController _c;
  late final VoiceRecorderController _voice;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _source = widget.source ?? ChatApi(session);
    // Собеседник вошёл или вышел — статус в шапке меняется сразу.
    _presence = session.realtime.presence..addListener(_onPresence);
    _realtime = session.realtime;
    _typing = session.realtime.typing..addListener(_onPresence);
    _c = ThreadController(
      _source,
      conversationId: widget.conversationId,
      meId: session.user?.id ?? 0,
      knownPeerId: widget.otherMemberId,
      onRead: () => UnreadBadge.instance.refresh(session),
    )
      ..listen(widget.events ?? session.realtime.chatEvents);
    final loaded = _c.load();
    final target = widget.jumpToMessageId;
    if (target != null) loaded.then((_) => _jumpAfterFrame(target));
    // Недописанное сообщение возвращается, а набор текста виден собеседникам («печатает…»).
    final draft = DraftStore.instance.textFor(widget.conversationId);
    if (draft.isNotEmpty) _input.text = draft;
    _input.addListener(_onInput);
    _voice = VoiceRecorderController(widget.voiceBackend ?? RecordVoiceBackend())..addListener(_onVoiceChanged);
    _scroll.addListener(_onScroll);
    _c.addListener(_onThreadChanged);
    WidgetsBinding.instance.addObserver(this);
    PushService.activeConversationId = widget.conversationId;
  }

  /// Свёрнутое приложение сообщения не читает: отмечаем прочитанным, когда человек вернулся в чат.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _c.active = state == AppLifecycleState.resumed;
    if (_c.active) {
      _c.refresh();
      _c.markRead();
    }
  }

  void _onPresence() {
    if (mounted) setState(() {});
  }

  /// Текст поменялся: сохраняем черновик и сообщаем, что печатаю (не чаще раза в 3 секунды).
  void _onInput() {
    final text = _input.text;
    if (_c.editing == null) DraftStore.instance.set(widget.conversationId, text);
    if (text.trim().isEmpty) {
      _stopTyping();
      return;
    }
    final now = DateTime.now();
    if (!_typingSent || now.difference(_typingSentAt) > const Duration(seconds: 3)) {
      _typingSent = true;
      _typingSentAt = now;
      _realtime.sendTyping(widget.conversationId, typing: true);
    }
  }

  // ───────────── переход к сообщению ─────────────

  static const _averageBubbleHeight = 96.0;

  Future<void> _jumpAfterFrame(String id) async {
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) await _jumpTo(id);
  }

  /// Прокручивает чат к сообщению и ненадолго подсвечивает его. Старые сообщения догружаются сами.
  Future<void> _jumpTo(String id) async {
    if (!await _c.ensureLoaded(id)) {
      if (mounted) showMessage(context, 'Сообщение не найдено — возможно, оно удалено');
      return;
    }
    if (!mounted) return;
    final views = groupMessages(_c.messages, DateTime.now());
    final position = views.indexWhere((v) => v.message.id == id);
    if (position < 0) return;
    final reversedIndex = views.length - 1 - position;
    final key = GlobalObjectKey('bubble:$id');
    // Список ленивый: пока сообщение не построено, прыгаем к примерному месту и подправляем.
    for (var attempt = 0; attempt < 14 && mounted; attempt++) {
      final built = key.currentContext;
      if (built != null && built.mounted) {
        await Scrollable.ensureVisible(built, alignment: 0.4, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
        _flash(id);
        return;
      }
      if (!_scroll.hasClients) return;
      final guess = reversedIndex * _averageBubbleHeight;
      final shift = attempt == 0 ? 0.0 : (attempt.isOdd ? 1 : -1) * 260.0 * ((attempt + 1) ~/ 2);
      _scroll.jumpTo((guess + shift).clamp(0.0, _scroll.position.maxScrollExtent));
      await WidgetsBinding.instance.endOfFrame;
    }
  }

  void _flash(String id) {
    _highlightTimer?.cancel();
    setState(() => _highlightId = id);
    _highlightTimer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _highlightId = null);
    });
  }

  Future<void> _openSearch() async {
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => ChatSearchPage(source: _source, conversationId: widget.conversationId)));
    if (id != null && mounted) await _jumpTo(id);
  }

  /// Тап по панели закреплённого: к сообщению, а следующий тап — к следующему закреплённому.
  Future<void> _openPinned() async {
    final list = _c.pinned;
    if (list.isEmpty) return;
    final i = _pinnedIndex.clamp(0, list.length - 1);
    setState(() => _pinnedIndex = (i + 1) % list.length);
    await _jumpTo(list[i].id);
  }

  void _stopTyping() {
    if (!_typingSent) return;
    _typingSent = false;
    _realtime.sendTyping(widget.conversationId, typing: false);
  }

  @override
  void dispose() {
    _presence.removeListener(_onPresence);
    _typing.removeListener(_onPresence);
    _input.removeListener(_onInput);
    _stopTyping();
    _highlightTimer?.cancel();
    unawaited(DraftStore.instance.save());
    WidgetsBinding.instance.removeObserver(this);
    if (PushService.activeConversationId == widget.conversationId) PushService.activeConversationId = null;
    _scroll.removeListener(_onScroll);
    _c.removeListener(_onThreadChanged);
    _scroll.dispose();
    _input.dispose();
    _focus.dispose();
    _c.dispose();
    _voice.removeListener(_onVoiceChanged);
    _voice.dispose();
    super.dispose();
  }

  bool get _atBottom => !_scroll.hasClients || _scroll.position.pixels < 80;

  String? get _latestId {
    for (var i = _c.messages.length - 1; i >= 0; i--) {
      if (!_c.messages[i].pending) return _c.messages[i].id;
    }
    return null;
  }

  /// Сколько сообщений от других пришло, пока чат был прокручен вверх.
  int get _newBelow {
    final marker = _bottomLatestId;
    if (marker == null) return 0;
    final from = int.tryParse(marker) ?? 0;
    return _c.messages.where((m) => !m.pending && m.senderId != _c.meId && (int.tryParse(m.id) ?? 0) > from).length;
  }

  /// Первый раз после загрузки: находим первое непрочитанное, ставим разделитель и прокручиваем к нему.
  void _onThreadChanged() {
    if (!_unreadResolved && !_c.loading && _c.messages.isNotEmpty) {
      _unreadResolved = true;
      final unread = widget.unreadCount;
      if (unread > 0 && widget.jumpToMessageId == null) {
        final others = [for (final m in _c.messages) if (!m.pending && m.senderId != _c.meId) m];
        if (others.isNotEmpty) {
          final first = others[(others.length - unread).clamp(0, others.length - 1)];
          _firstUnreadId = first.id;
          if (unread > 3) WidgetsBinding.instance.addPostFrameCallback((_) => _jumpAfterFrame(first.id));
        }
      }
      _bottomLatestId = _latestId;
    }
    if (_atBottom) _bottomLatestId = _latestId;
  }

  void _scrollToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(0, duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final away = _scroll.position.pixels > 300;
    final latest = _latestId;
    final seen = _atBottom && _bottomLatestId != latest;
    if (seen) _bottomLatestId = latest;
    // Счётчик на кнопке обнуляется, как только долистали до низа.
    if (away != _showDown || seen) setState(() => _showDown = away);
    // Список перевёрнут: «вверх по истории» — это конец прокрутки.
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) _c.loadOlder();
  }

  SessionController get _session => context.read<SessionController>();
  String get _origin => _session.apiOrigin;
  bool get _isGroup => (_c.meta?.type ?? widget.type) != 'private';

  void _toast(Object error) {
    if (mounted) showMessage(context, actionError(error));
  }

  Future<void> _openUrl(String raw) async {
    if (openInviteIfAny(context, raw)) return;
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, 'Не удалось открыть ссылку');
  }

  /// Личный звонок уходит только с известным собеседником — иначе сервер сочтёт его групповым.
  Future<void> _startCall({bool video = false}) async {
    if (!_isGroup && _c.peerId == null) {
      await _c.ensurePeer();
      if (!mounted) return;
      if (_c.peerId == null) {
        showMessage(context, 'Не удалось определить собеседника. Проверьте интернет и попробуйте ещё раз.');
        return;
      }
    }
    await pushPage(
      context,
      CallPage(
        conversationId: widget.conversationId,
        recipientId: _isGroup ? null : _c.peerId,
        title: widget.title,
        video: video,
      ),
    );
  }

  // ───────────── отправка ─────────────

  Future<void> _sendText() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    try {
      await _c.submit(normalizeMentions(text));
      _input.clear();
      _scrollToBottom();
    } catch (error) {
      _toast(error);
    }
  }

  /// Загрузить и отправить выбранное; ошибки по файлам — одним сообщением, текст не теряется.
  Future<void> _sendFiles(List<PickedAttachment> items, {bool voice = false}) async {
    if (items.isEmpty) return;
    final failures = await _c.sendAttachments(items, voice: voice);
    if (!mounted || failures.isEmpty) return;
    showMessage(context, failures.length == 1 ? failures.first : '${failures.first}\nИ ещё ${failures.length - 1}: не отправлены');
  }

  /// Выбор вложения; сбой выбора (нет доступа и т. п.) показываем, а не глотаем.
  ///
  /// Если окно выбора закрылось мгновенно и ничего не вернуло (на части телефонов галерея так себя ведёт),
  /// говорим об этом и предлагаем выбрать через «Файлы» — раньше это выглядело как «ничего не произошло».
  Future<void> _pick(Future<List<PickedAttachment>> Function() choose, {String? kind}) async {
    final started = DateTime.now();
    try {
      final picked = await choose();
      if (picked.isNotEmpty) return await _sendFiles(picked);
      final quick = DateTime.now().difference(started) < widget.instantClose;
      if (kind != null && quick && mounted) _offerFiles(kind);
    } on PickerException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  void _offerFiles(String kind) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        duration: const Duration(seconds: 10),
        content: const Text('Окно выбора закрылось, ничего не выбрав. Попробуйте выбрать через «Файлы».'),
        action: SnackBarAction(label: 'Выбрать', onPressed: () => _viaFiles(kind)),
      ));
  }

  Future<void> _viaFiles(String kind) async {
    try {
      final picked = await _picker.viaFiles(kind);
      if (picked.isEmpty) return;
      await _picker.preferFiles(); // сработало — в следующий раз сразу этот способ
      await _sendFiles(picked);
    } on PickerException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  Future<void> _attach() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.lg),
          child: ListGroup(
            children: [
              ListRow(leading: const IconTile(Icons.image_outlined, tone: Tone.violet), title: 'Фото из галереи', chevron: false, onTap: () => Navigator.pop(context, 'photos')),
              ListRow(leading: const IconTile(Icons.videocam_outlined, tone: Tone.red), title: 'Видео', chevron: false, onTap: () => Navigator.pop(context, 'video')),
              ListRow(leading: const IconTile(Icons.photo_camera_outlined, tone: Tone.teal), title: 'Снять фото', chevron: false, onTap: () => Navigator.pop(context, 'camera')),
              ListRow(leading: const IconTile(Icons.insert_drive_file_outlined, tone: Tone.amber), title: 'Файл', chevron: false, onTap: () => Navigator.pop(context, 'files')),
              ListRow(leading: const IconTile(Icons.poll_outlined, tone: Tone.green), title: 'Опрос', chevron: false, onTap: () => Navigator.pop(context, 'poll')),
            ],
          ),
        ),
      ),
    );
    switch (choice) {
      case 'photos':
        await _pick(_picker.photos, kind: 'image');
      case 'video':
        await _pick(() async => [?await _picker.video()], kind: 'video');
      case 'camera':
        await _pick(() async => [?await _picker.camera()]);
      case 'files':
        await _pick(_picker.files);
      case 'poll':
        await _poll();
    }
  }

  /// Запись готова: уходит как голосовое с длительностью и волной (в вебе длительность тоже читается).
  Future<void> _sendVoice(VoiceClip clip) => _sendFiles(
        [
          PickedAttachment(
            path: clip.path,
            name: 'voice.m4a',
            mimeType: 'audio/mp4',
            extra: {'durationSec': clip.duration.inSeconds < 1 ? 1 : clip.duration.inSeconds, 'waveform': clip.waveform},
          ),
        ],
        voice: true,
      );

  /// Причины, по которым запись не началась или не ушла, показываем, а не глотаем.
  void _onVoiceChanged() {
    final problem = _voice.problem;
    if (problem == null || !mounted) return;
    _voice.clearProblem();
    showMessage(context, problem);
  }

  Future<void> _poll() async {
    final question = TextEditingController();
    final fields = [TextEditingController(), TextEditingController(), TextEditingController()];
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Опрос'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: question, decoration: const InputDecoration(hintText: 'Вопрос')),
              const SizedBox(height: 10),
              TextField(controller: fields[0], decoration: const InputDecoration(hintText: 'Вариант 1')),
              const SizedBox(height: 10),
              TextField(controller: fields[1], decoration: const InputDecoration(hintText: 'Вариант 2')),
              const SizedBox(height: 10),
              TextField(controller: fields[2], decoration: const InputDecoration(hintText: 'Вариант 3, если нужен')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Отправить')),
        ],
      ),
    );
    final options = [for (final f in fields) if (f.text.trim().isNotEmpty) f.text.trim()];
    final text = question.text.trim();
    question.dispose();
    for (final f in fields) {
      f.dispose();
    }
    if (created != true || !mounted || text.isEmpty || options.length < 2) return;
    try {
      await _c.sendPayload(payloadType: 'poll', caption: text, payload: {'options': options, 'allows_multiple': false, 'anonymous': false});
    } catch (error) {
      _toast(error);
    }
  }

  // ───────────── меню сообщения ─────────────

  Future<void> _menu(ChatMessage message) async {
    final me = _c.meId;
    final actions = actionsFor(message, me: me, groupLike: _isGroup, canPin: _c.canPin);
    if (!actions.any) return;
    final choice = await showMessageMenu(context, message: message, actions: actions);
    if (choice == null || !mounted) return;
    final emoji = choice.emoji;
    if (emoji != null) return _react(message, emoji);
    switch (choice.command!) {
      case MessageCommand.reply:
        _c.startReply(message);
        _focus.requestFocus();
      case MessageCommand.edit:
        _c.startEdit(message);
        _input.text = denormalizeMentions(message.content, _memberNames);
        _input.selection = TextSelection.collapsed(offset: _input.text.length);
        _focus.requestFocus();
      case MessageCommand.copy:
        await Clipboard.setData(ClipboardData(text: mentionsAsText(message.content, _memberNames)));
        if (mounted) showMessage(context, 'Текст скопирован');
      case MessageCommand.forward:
        await _forward(message);
      case MessageCommand.readers:
        await showReadersSheet(context, _source, message.id);
      case MessageCommand.pin:
      case MessageCommand.unpin:
        try {
          await _c.pin(message, choice.command == MessageCommand.pin);
        } catch (error) {
          _toast(error);
        }
      case MessageCommand.select:
        _toggleSelect(message);
      case MessageCommand.delete:
        if (!await confirmDeleteMessage(context)) return;
        try {
          await _c.remove(message);
        } catch (error) {
          _toast(error);
        }
    }
  }

  // ───────────── выбор нескольких сообщений ─────────────

  Map<int, String> get _memberNames => {for (final m in _c.members.values) m.id: m.name};

  bool get _selecting => _selected.isNotEmpty;

  void _toggleSelect(ChatMessage message) {
    if (!actionsFor(message, me: _c.meId, groupLike: _isGroup, canPin: false).select) return;
    setState(() {
      if (!_selected.remove(message.id)) _selected.add(message.id);
    });
  }

  void _clearSelection() => setState(_selected.clear);

  List<ChatMessage> get _selectedMessages => orderedSelection(_c.messages, _selected);

  Future<void> _copySelection() async {
    final text = selectionText(_selectedMessages, withAuthors: _isGroup, names: _memberNames);
    if (text.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    _clearSelection();
    showMessage(context, 'Текст скопирован');
  }

  Future<void> _forwardSelection() async {
    final chosen = _selectedMessages;
    final ids = await showForwardSheet(context, _source, excludeId: widget.conversationId);
    if (ids == null || ids.isEmpty || !mounted) return;
    try {
      for (final m in chosen) {
        await _source.forward(m.id, ids);
      }
      if (!mounted) return;
      _clearSelection();
      showMessage(context, chosen.length == 1 ? 'Сообщение переслано' : '${messagesCount(chosen.length)} пересланы');
    } catch (error) {
      _toast(error);
    }
  }

  Future<void> _deleteSelection() async {
    final chosen = _selectedMessages;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(chosen.length == 1 ? 'Удалить сообщение?' : 'Удалить ${messagesCount(chosen.length)}?'),
        content: const Text('Они пропадут у всех участников чата.'),
        actions: [
          TextButton(key: const ValueKey('selection-delete-cancel'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
          TextButton(key: const ValueKey('selection-delete-ok'), onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    var failed = 0;
    for (final m in chosen) {
      try {
        await _c.remove(m);
      } catch (_) {
        failed++;
      }
    }
    if (!mounted) return;
    _clearSelection();
    if (failed > 0) showMessage(context, failed == chosen.length ? 'Не удалось удалить — проверьте интернет и попробуйте снова' : 'Не удалось удалить ${messagesCount(failed)}');
  }

  /// Долгое нажатие — сразу реакции (то же меню, реакции сверху).
  Future<void> _react(ChatMessage message, String emoji) async {
    try {
      await _c.react(message, emoji);
    } catch (error) {
      _toast(error);
    }
  }

  Future<void> _forward(ChatMessage message) async {
    final ids = await showForwardSheet(context, _source, excludeId: widget.conversationId);
    if (ids == null || ids.isEmpty || !mounted) return;
    try {
      await _source.forward(message.id, ids);
      if (mounted) showMessage(context, ids.length == 1 ? 'Сообщение переслано' : 'Сообщение переслано в ${ids.length} чата');
    } catch (error) {
      _toast(error);
    }
  }

  Future<void> _vote(ChatMessage message, int option) async {
    try {
      await _c.vote(message, option);
    } catch (error) {
      _toast(error);
    }
  }

  // ───────────── профиль ─────────────

  Future<void> _openProfile() async {
    await pushPage(
      context,
      ChatProfilePage(
        conversationId: widget.conversationId,
        title: widget.title,
        isGroup: _isGroup,
        channel: (_c.meta?.type ?? widget.type) == 'channel',
        otherMemberId: widget.otherMemberId,
        avatarUrl: widget.avatarUrl,
        muted: widget.muted,
        source: widget.source,
      ),
    );
  }

  /// Автор из группы: открыть его личный чат.
  Future<void> _openSender(int memberId) async {
    if (memberId == _c.meId) return;
    final member = _c.memberOf(memberId);
    try {
      final id = await ChurchApi(_session).openPersonal(memberId);
      if (!mounted || id.isEmpty) return;
      await pushPage(context, ThreadPage(conversationId: id, title: member?.name ?? 'Чат', otherMemberId: memberId, avatarUrl: member?.avatarUrl == null ? null : resolveUrl(_origin, member!.avatarUrl)));
    } catch (error) {
      if (mounted) showMessage(context, describeDio(error));
    }
  }

  ChatMember? _member(int? id) {
    final m = _c.memberOf(id);
    if (m == null || m.avatarUrl == null) return m;
    return ChatMember(id: m.id, name: m.name, avatarUrl: resolveUrl(_origin, m.avatarUrl), role: m.role, online: m.online, lastSeen: m.lastSeen);
  }

  String _subtitle() {
    if (_isGroup) {
      final n = _c.members.length;
      return n == 0 ? '' : membersCaption(n, channel: (_c.meta?.type ?? widget.type) == 'channel');
    }
    final presence = _presence;
    final peer = _c.peerId ?? widget.otherMemberId;
    return presenceLabel(
      online: presence.isOnline(peer),
      lastSeen: presence.lastSeenOf(peer) ?? parseApiDate(widget.lastSeen),
      now: DateTime.now(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ownHost = Uri.tryParse(_origin)?.host;
    final typing = _typing.label(widget.conversationId, group: _isGroup);
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final views = groupMessages(_c.messages, DateTime.now());
        final selecting = _selecting;
        final mentionNames = _memberNames;
        final sel = selectionActions(_selectedMessages, me: _c.meId, groupLike: _isGroup, canPin: false);
        return PopScope(
          canPop: !selecting,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && _selecting) _clearSelection();
          },
          child: ChurchPage(
          title: selecting ? 'Выбрано: ${_selected.length}' : widget.title,
          // Пока собеседник печатает — это вместо статуса, акцентным цветом.
          subtitle: selecting ? null : (typing == null ? _subtitle() : null),
          subtitleAccent: selecting ? null : typing,
          leading: selecting ? null : ChurchAvatar(name: widget.title, imageUrl: widget.avatarUrl, size: 40),
          onTitleTap: selecting ? null : _openProfile,
          sheetColor: palette.isDark ? palette.sheet : const Color(0xFFF3ECE3),
          actions: selecting
              ? [
                  if (sel.copy) HeaderButton(icon: Icons.content_copy_rounded, tooltip: 'Копировать', onPressed: _copySelection),
                  if (sel.forward) HeaderButton(icon: Icons.forward_rounded, tooltip: 'Переслать', onPressed: _forwardSelection),
                  if (sel.delete) HeaderButton(icon: Icons.delete_outline_rounded, tooltip: 'Удалить', onPressed: _deleteSelection),
                  HeaderButton(icon: Icons.close_rounded, tooltip: 'Отменить выбор', onPressed: _clearSelection),
                ]
              : [
            HeaderButton(icon: Icons.search_rounded, tooltip: 'Поиск по чату', onPressed: _openSearch),
            if (!_isGroup)
              HeaderButton(
                icon: Icons.videocam_outlined,
                tooltip: 'Видеозвонок',
                onPressed: () => _startCall(video: true),
              ),
            HeaderButton(
              icon: Icons.call_outlined,
              tooltip: 'Позвонить',
              onPressed: () => _startCall(),
            ),
          ],
          body: Column(
            children: [
              PinnedBar(
                pinned: _c.pinned,
                index: _pinnedIndex,
                onTap: _openPinned,
                onClose: _c.canPin && _c.pinned.isNotEmpty ? () => _c.pin(_c.pinned[_pinnedIndex.clamp(0, _c.pinned.length - 1)], false) : null,
              ),
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                child: AsyncBody(
            loading: _c.loading,
            error: _c.error,
            onRetry: _c.load,
            child: views.isEmpty
                ? const EmptyHint('Сообщений пока нет', icon: Icons.waving_hand_outlined, hint: 'Напишите первым')
                : ListView.builder(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 12),
                    itemCount: views.length + (_c.loadingOlder ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == views.length) {
                        return const Padding(padding: EdgeInsets.all(16), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))));
                      }
                      final view = views[views.length - 1 - index];
                      final message = view.message;
                      final bubble = MessageBubble(
                        key: ValueKey(message.id),
                        view: view,
                        me: _c.meId,
                        groupLike: _isGroup,
                        origin: _origin,
                        ownHost: ownHost,
                        member: _member(message.senderId),
                        loadPreview: _c.previewOf,
                        onMenu: () => selecting ? _toggleSelect(message) : _menu(message),
                        onReactionMenu: () => selecting ? _toggleSelect(message) : _menu(message),
                        onReply: () {
                          if (selecting) return;
                          if (actionsFor(message, me: _c.meId, groupLike: _isGroup, canPin: false).reply) {
                            _c.startReply(message);
                            _focus.requestFocus();
                          }
                        },
                        onOpenUrl: _openUrl,
                        onVote: (option) => _vote(message, option),
                        onReact: (emoji) => _react(message, emoji),
                        onOpenSender: _openSender,
                        onOpenReply: selecting ? null : _jumpTo,
                        mentionNames: mentionNames,
                      );
                      final framed = KeyedSubtree(
                        key: GlobalObjectKey('bubble:${message.id}'),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 350),
                          decoration: BoxDecoration(
                            color: _highlightId == message.id || _selected.contains(message.id) ? palette.accent.withValues(alpha: 0.16) : Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: selecting
                              ? Row(
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.only(left: 4, right: 2),
                                      child: Icon(
                                        key: ValueKey(_selected.contains(message.id) ? 'selected-${message.id}' : 'unselected-${message.id}'),
                                        _selected.contains(message.id) ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                                        size: 24,
                                        color: _selected.contains(message.id) ? palette.accent : palette.inkFaint,
                                      ),
                                    ),
                                    Expanded(child: bubble),
                                  ],
                                )
                              : bubble,
                        ),
                      );
                      if (message.id != _firstUnreadId) return framed;
                      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const NewMessagesDivider(), framed]);
                    },
                  ),
                ),
                    ),
                    Positioned(
                      right: 12,
                      bottom: 12,
                      child: ScrollDownButton(visible: _showDown, count: _newBelow, onTap: _scrollToBottom),
                    ),
                  ],
                ),
              ),
            ],
          ),
          bottom: selecting ? null : ChatComposer(
            controller: _input,
            focusNode: _focus,
            sending: _c.sending,
            canSend: _c.canSend,
            canSendMedia: _c.canSendMedia,
            replyTo: _c.replyTo,
            editing: _c.editing,
            uploading: _c.uploading,
            onCancelMode: () {
              if (_c.editing != null) _input.clear();
              _c.cancelComposerMode();
            },
            onSend: _sendText,
            onAttach: _attach,
            voice: _voice,
            onVoiceClip: _sendVoice,
            mentionMembers: _isGroup ? [for (final id in _c.members.keys) ?_member(id)] : const [],
            meId: _c.meId,
          ),
        ),
        );
      },
    );
  }
}
