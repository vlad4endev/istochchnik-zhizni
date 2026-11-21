import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/push.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../calls/call_page.dart';
import '../prayer/widgets/sheet_frame.dart' show actionError;
import 'chat_profile_page.dart';
import 'data/chat_source.dart';
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

  @override
  State<ThreadPage> createState() => _ThreadPageState();
}

class _ThreadPageState extends State<ThreadPage> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  AudioRecorder? _recorderInstance;

  /// Рекордер нужен только для голосовых — создаём при первой записи, а не при открытии чата.
  AudioRecorder get _recorder => _recorderInstance ??= AudioRecorder();
  late final ChatSource _source;
  late final ThreadController _c;
  bool _recording = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _source = widget.source ?? ChatApi(session);
    _c = ThreadController(_source, conversationId: widget.conversationId, meId: session.user?.id ?? 0)
      ..listen(widget.events ?? session.realtime.chatEvents)
      ..load();
    _scroll.addListener(_onScroll);
    PushService.activeConversationId = widget.conversationId;
  }

  @override
  void dispose() {
    if (PushService.activeConversationId == widget.conversationId) PushService.activeConversationId = null;
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _input.dispose();
    _focus.dispose();
    _c.dispose();
    _recorderInstance?.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
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
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, 'Не удалось открыть ссылку');
  }

  // ───────────── отправка ─────────────

  Future<void> _sendText() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    try {
      await _c.submit(text);
      _input.clear();
    } catch (error) {
      _toast(error);
    }
  }

  Future<void> _sendUpload(String path, String name, String payloadType) async {
    try {
      final uploaded = await _source.upload(path: path, name: name, conversationId: widget.conversationId);
      await _c.sendPayload(
        payloadType: payloadType,
        payload: {
          'url': str(uploaded['url']),
          'name': str(uploaded['name']).isEmpty ? name : str(uploaded['name']),
          'objectPath': str(uploaded['objectPath']),
          'mimeType': str(uploaded['mimeType']),
          'size': asInt(uploaded['size']),
          if (payloadType == 'audio') 'kind': 'voice',
        },
      );
    } catch (error) {
      _toast(error);
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
              ListRow(leading: const IconTile(Icons.image_outlined, tone: Tone.violet), title: 'Фото из галереи', chevron: false, onTap: () => Navigator.pop(context, 'image')),
              ListRow(leading: const IconTile(Icons.insert_drive_file_outlined, tone: Tone.amber), title: 'Файл', chevron: false, onTap: () => Navigator.pop(context, 'file')),
              ListRow(leading: const IconTile(Icons.poll_outlined, tone: Tone.green), title: 'Опрос', chevron: false, onTap: () => Navigator.pop(context, 'poll')),
            ],
          ),
        ),
      ),
    );
    switch (choice) {
      case 'image':
        final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
        if (file != null) await _sendUpload(file.path, file.name, 'image');
      case 'file':
        final files = await FilePicker.pickFiles();
        if (files.isEmpty || files.first.path == null) return;
        final name = files.first.name;
        final lower = name.toLowerCase();
        final type = ['.jpg', '.jpeg', '.png', '.webp'].any(lower.endsWith)
            ? 'image'
            : (['.m4a', '.mp3', '.aac', '.ogg'].any(lower.endsWith) ? 'audio' : 'file');
        await _sendUpload(files.first.path!, name, type);
      case 'poll':
        await _poll();
    }
  }

  Future<void> _toggleRecord() async {
    if (_recording) {
      final path = await _recorder.stop();
      setState(() => _recording = false);
      if (path == null || path.isEmpty) return;
      await _sendUpload(path, 'voice.m4a', 'audio');
      return;
    }
    if (!await _recorder.hasPermission()) {
      if (mounted) showMessage(context, 'Нет доступа к микрофону — разрешите его в настройках телефона');
      return;
    }
    final dir = await getTemporaryDirectory();
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
    setState(() => _recording = true);
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
        _input.text = message.content;
        _input.selection = TextSelection.collapsed(offset: _input.text.length);
        _focus.requestFocus();
      case MessageCommand.copy:
        await Clipboard.setData(ClipboardData(text: message.content));
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
      case MessageCommand.delete:
        if (!await confirmDeleteMessage(context)) return;
        try {
          await _c.remove(message);
        } catch (error) {
          _toast(error);
        }
    }
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
    return presenceLabel(online: false, lastSeen: parseApiDate(widget.lastSeen), now: DateTime.now());
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ownHost = Uri.tryParse(_origin)?.host;
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final views = groupMessages(_c.messages, DateTime.now());
        return ChurchPage(
          title: widget.title,
          subtitle: _subtitle(),
          leading: ChurchAvatar(name: widget.title, imageUrl: widget.avatarUrl, size: 40),
          onTitleTap: _openProfile,
          sheetColor: palette.isDark ? palette.sheet : const Color(0xFFF3ECE3),
          actions: [
            HeaderButton(
              icon: Icons.call_outlined,
              tooltip: 'Позвонить',
              onPressed: () => pushPage(context, CallPage(conversationId: widget.conversationId, recipientId: widget.otherMemberId, title: widget.title)),
            ),
          ],
          body: AsyncBody(
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
                      return MessageBubble(
                        key: ValueKey(message.id),
                        view: view,
                        me: _c.meId,
                        groupLike: _isGroup,
                        origin: _origin,
                        ownHost: ownHost,
                        member: _member(message.senderId),
                        loadPreview: _c.previewOf,
                        onMenu: () => _menu(message),
                        onReactionMenu: () => _menu(message),
                        onReply: () {
                          if (actionsFor(message, me: _c.meId, groupLike: _isGroup, canPin: false).reply) {
                            _c.startReply(message);
                            _focus.requestFocus();
                          }
                        },
                        onOpenUrl: _openUrl,
                        onVote: (option) => _vote(message, option),
                        onReact: (emoji) => _react(message, emoji),
                        onOpenSender: _openSender,
                      );
                    },
                  ),
          ),
          bottom: ChatComposer(
            controller: _input,
            focusNode: _focus,
            sending: _c.sending,
            recording: _recording,
            canSend: _c.canSend,
            canSendMedia: _c.canSendMedia,
            replyTo: _c.replyTo,
            editing: _c.editing,
            onCancelMode: () {
              if (_c.editing != null) _input.clear();
              _c.cancelComposerMode();
            },
            onSend: _sendText,
            onAttach: _attach,
            onToggleRecord: _toggleRecord,
          ),
        );
      },
    );
  }
}
