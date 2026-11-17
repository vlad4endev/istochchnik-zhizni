import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
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
import '../../ui/audio_player_page.dart';
import '../../ui/kit/kit.dart';
import '../../ui/video_page.dart';
import '../../ui/widgets.dart';
import '../calls/call_page.dart';

class ThreadPage extends StatefulWidget {
  const ThreadPage({
    super.key,
    required this.conversationId,
    required this.title,
    this.otherMemberId,
    this.avatarUrl,
    this.lastSeen,
  });

  final String conversationId;
  final String title;
  final int? otherMemberId;
  final String? avatarUrl;

  /// ISO-время последнего входа собеседника — для подписи в шапке.
  final String? lastSeen;

  @override
  State<ThreadPage> createState() => _ThreadPageState();
}

class _ThreadPageState extends State<ThreadPage> {
  final _input = TextEditingController();
  final _recorder = AudioRecorder();
  bool _loading = true;
  String? _error;
  List<dynamic> _messages = const [];
  bool _sending = false;
  bool _recording = false;

  @override
  void initState() {
    super.initState();
    _input.addListener(_onInput);
    PushService.activeConversationId = widget.conversationId;
    _load();
  }

  void _onInput() => setState(() {});

  Future<void> _attach() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.lg),
          child: ListGroup(
            children: [
              ListRow(
                leading: const IconTile(Icons.image_outlined, tone: Tone.violet),
                title: 'Фото из галереи',
                chevron: false,
                onTap: () => Navigator.pop(context, 'image'),
              ),
              ListRow(
                leading: const IconTile(Icons.insert_drive_file_outlined, tone: Tone.amber),
                title: 'Файл',
                chevron: false,
                onTap: () => Navigator.pop(context, 'file'),
              ),
              ListRow(
                leading: const IconTile(Icons.poll_outlined, tone: Tone.green),
                title: 'Опрос',
                chevron: false,
                onTap: () => Navigator.pop(context, 'poll'),
              ),
            ],
          ),
        ),
      ),
    );
    switch (choice) {
      case 'image':
        await _pickImage();
      case 'file':
        await _pickFile();
      case 'poll':
        await _poll();
    }
  }

  @override
  void dispose() {
    if (PushService.activeConversationId == widget.conversationId) PushService.activeConversationId = null;
    _input.removeListener(_onInput);
    _input.dispose();
    _recorder.dispose();
    super.dispose();
  }

  ChurchApi get _api => ChurchApi(context.read<SessionController>());

  Future<void> _load() async {
    try {
      final messages = await _api.messages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _messages = messages.reversed.toList();
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _sendText() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _api.sendMessage(widget.conversationId, text);
      _input.clear();
      await _load();
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendUpload(String path, String name, String payloadType) async {
    setState(() => _sending = true);
    try {
      final uploaded = await _api.uploadChatFile(
        path: path,
        name: name,
        conversationId: widget.conversationId,
      );
      await _api.sendMessage(
        widget.conversationId,
        '',
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
      await _load();
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickImage() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file == null) return;
    await _sendUpload(file.path, file.name, 'image');
  }

  Future<void> _pickFile() async {
    final files = await FilePicker.pickFiles();
    if (files.isEmpty) return;
    final file = files.first;
    final path = file.path;
    if (path == null) return;
    final name = file.name;
    final lower = name.toLowerCase();
    final type = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')
        ? 'image'
        : lower.endsWith('.m4a') || lower.endsWith('.mp3') || lower.endsWith('.aac') || lower.endsWith('.ogg')
            ? 'audio'
            : 'file';
    await _sendUpload(path, name, type);
  }

  Future<void> _toggleRecord() async {
    if (_recording) {
      final path = await _recorder.stop();
      setState(() => _recording = false);
      if (path == null || path.isEmpty) return;
      await _sendUpload(path, 'voice.m4a', 'audio');
      return;
    }
    final allowed = await _recorder.hasPermission();
    if (!allowed) {
      if (!mounted) return;
      showMessage(context, 'Нет доступа к микрофону — разрешите его в настройках телефона');
      return;
    }
    final dir = await getTemporaryDirectory();
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc),
      path: '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a',
    );
    setState(() => _recording = true);
  }

  Future<void> _poll() async {
    final question = TextEditingController();
    final first = TextEditingController();
    final second = TextEditingController();
    final extra = TextEditingController();
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Опрос'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: question, decoration: const InputDecoration(hintText: 'Вопрос')),
            const SizedBox(height: 10),
            TextField(controller: first, decoration: const InputDecoration(hintText: 'Вариант 1')),
            const SizedBox(height: 10),
            TextField(controller: second, decoration: const InputDecoration(hintText: 'Вариант 2')),
            const SizedBox(height: 10),
            TextField(controller: extra, decoration: const InputDecoration(hintText: 'Вариант 3, если нужен')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Отправить')),
        ],
      ),
    );
    if (created != true || !mounted) return;
    final options = [first.text.trim(), second.text.trim(), extra.text.trim()].where((item) => item.isNotEmpty).toList();
    if (question.text.trim().isEmpty || options.length < 2) return;
    try {
      await _api.sendMessage(
        widget.conversationId,
        question.text.trim(),
        payloadType: 'poll',
        payload: {'options': options, 'allows_multiple': false, 'anonymous': false},
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    }
  }

  Future<void> _vote(String messageId, int index) async {
    try {
      await _api.votePoll(messageId, [index]);
      await _load();
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    }
  }

  String _presence() {
    final seen = parseApiDate(widget.lastSeen);
    if (seen == null) return '';
    if (DateTime.now().difference(seen).inMinutes < 3) return 'в сети';
    return 'был(а) ${relativeTime(widget.lastSeen)}';
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionController>().user?.id;
    final origin = context.watch<SessionController>().apiOrigin;
    final palette = context.palette;
    final hasText = _input.text.trim().isNotEmpty;
    return ChurchPage(
      title: widget.title,
      subtitle: _presence(),
      leading: ChurchAvatar(name: widget.title, imageUrl: widget.avatarUrl, size: 40),
      sheetColor: palette.isDark ? palette.sheet : const Color(0xFFF3ECE3),
      actions: [
        HeaderButton(
          icon: Icons.call_outlined,
          tooltip: 'Позвонить',
          onPressed: () => pushPage(
            context,
            CallPage(
              conversationId: widget.conversationId,
              recipientId: widget.otherMemberId,
              title: widget.title,
            ),
          ),
        ),
      ],
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _messages.isEmpty
            ? const EmptyHint('Сообщений пока нет', icon: Icons.waving_hand_outlined, hint: 'Напишите первым')
            : ListView.builder(
                reverse: true,
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final message = asMap(_messages[index]);
                  final mine = asInt(message['sender_id']) == me;
                  final deleted = asBool(message['is_deleted']);
                  final time = parseApiDate(message['created_at']);
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      padding: const EdgeInsets.fromLTRB(14, 9, 12, 7),
                      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                      decoration: BoxDecoration(
                        gradient: mine && !deleted ? wineGradient : null,
                        color: deleted ? palette.accentSoft.withValues(alpha: 0.7) : (mine ? null : palette.card),
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(18),
                          topRight: const Radius.circular(18),
                          bottomLeft: Radius.circular(mine ? 18 : 6),
                          bottomRight: Radius.circular(mine ? 6 : 18),
                        ),
                        boxShadow: mine || deleted ? null : palette.cardShadow,
                      ),
                      child: DefaultTextStyle.merge(
                        style: TextStyle(
                          fontSize: 15.5,
                          height: 1.35,
                          color: deleted ? palette.inkFaint : (mine ? Colors.white : palette.ink),
                          fontStyle: deleted ? FontStyle.italic : FontStyle.normal,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _MessageBody(
                              message: message,
                              origin: origin,
                              mine: mine,
                              onVote: (index) => _vote(str(message['id']), index),
                            ),
                            if (time != null && !deleted)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  DateFormat('HH:mm').format(time),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontStyle: FontStyle.normal,
                                    color: mine ? Colors.white.withValues(alpha: 0.7) : palette.inkFaint,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
      bottom: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.sheet,
          border: Border(top: BorderSide(color: palette.hairline)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 8, 10, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  tooltip: 'Прикрепить',
                  onPressed: _sending ? null : _attach,
                  icon: Icon(Icons.attach_file_rounded, color: palette.inkMuted),
                ),
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: _recording ? 'Идёт запись голосового…' : 'Сообщение',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.accent, width: 1.4)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _RoundAction(
                  icon: hasText ? Icons.send_rounded : (_recording ? Icons.stop_rounded : Icons.mic_none_rounded),
                  tooltip: hasText ? 'Отправить' : (_recording ? 'Остановить и отправить' : 'Записать голосовое'),
                  busy: _sending,
                  danger: _recording,
                  onPressed: _sending ? null : (hasText ? _sendText : _toggleRecord),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.tooltip, required this.onPressed, this.busy = false, this.danger = false});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: danger ? null : wineGradient,
            color: danger ? ChurchColors.danger : null,
          ),
          child: Material(
            type: MaterialType.transparency,
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: SizedBox(
                width: 46,
                height: 46,
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.all(13),
                        child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                      )
                    : Icon(icon, color: Colors.white, size: 22),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({required this.message, required this.origin, required this.onVote, required this.mine});
  final Map<String, dynamic> message;
  final String origin;
  final bool mine;
  final ValueChanged<int> onVote;

  @override
  Widget build(BuildContext context) {
    if (asBool(message['is_deleted'])) return const Text('Сообщение удалено');
    final type = str(message['payload_type']).isEmpty ? 'text' : str(message['payload_type']);
    final payload = asMap(message['payload']);
    final url = resolveUrl(origin, str(payload['url']));
    final caption = str(message['content']);
    if (type == 'image' && url.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(url, width: 220, fit: BoxFit.cover)),
          if (caption.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(caption)),
        ],
      );
    }
    if (type == 'audio' && url.isNotEmpty) {
      final voice = str(payload['kind']) == 'voice' || str(payload['name']).isEmpty;
      return InkWell(
        onTap: () => pushPage(context, AudioPlayerPage(url: url, title: voice ? 'Голосовое' : str(payload['name']))),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.play_circle_fill_rounded, size: 30, color: mine ? Colors.white : ChurchColors.wine),
            const SizedBox(width: 8),
            Text(voice ? 'Голосовое' : str(payload['name'])),
          ],
        ),
      );
    }
    if (type == 'file' && url.isNotEmpty) {
      return InkWell(
        onTap: () {
          final uri = Uri.tryParse(url);
          if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
        },
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.insert_drive_file_outlined, color: mine ? Colors.white : ChurchColors.wine),
            const SizedBox(width: 8),
            Flexible(child: Text(str(payload['name']).isEmpty ? 'Файл' : str(payload['name']))),
          ],
        ),
      );
    }
    if (type == 'video_note' && url.isNotEmpty) {
      return InkWell(
        onTap: () => pushPage(context, VideoPage(url: url)),
        child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.videocam), SizedBox(width: 8), Text('Видео')]),
      );
    }
    if (type == 'poll') {
      final options = asList(payload['options']);
      final tallies = asList(message['poll_tallies']);
      var total = 0;
      for (final t in tallies) {
        total += asInt(t);
      }
      final fg = mine ? Colors.white : context.palette.ink;
      return ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 220),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.poll_outlined, size: 16, color: mine ? ChurchColors.amber : ChurchColors.wine),
                const SizedBox(width: 6),
                Flexible(child: Text(caption, style: TextStyle(fontWeight: FontWeight.w700, color: fg))),
              ],
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < options.length; i++)
              Builder(builder: (context) {
                final votes = i < tallies.length ? asInt(tallies[i]) : 0;
                final share = total == 0 ? 0.0 : votes / total;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => onVote(i),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 40),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: fg.withValues(alpha: 0.25)),
                      ),
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: FractionallySizedBox(
                              alignment: Alignment.centerLeft,
                              widthFactor: share,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: (mine ? Colors.white : ChurchColors.wine).withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                            child: Row(
                              children: [
                                Expanded(child: Text(str(options[i]), style: TextStyle(fontSize: 14, color: fg))),
                                Text('$votes', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: fg)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            Text(
              total == 0 ? 'Голосов пока нет' : 'Голосов: $total',
              style: TextStyle(fontSize: 12, color: fg.withValues(alpha: 0.7)),
            ),
          ],
        ),
      );
    }
    return Text(caption);
  }
}
