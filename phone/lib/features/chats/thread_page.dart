import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/audio_player_page.dart';
import '../../ui/video_page.dart';
import '../../ui/widgets.dart';
import '../calls/call_page.dart';

class ThreadPage extends StatefulWidget {
  const ThreadPage({
    super.key,
    required this.conversationId,
    required this.title,
    this.otherMemberId,
  });

  final String conversationId;
  final String title;
  final int? otherMemberId;

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
    _load();
  }

  @override
  void dispose() {
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Нет доступа к микрофону')));
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
            TextField(controller: question, decoration: const InputDecoration(labelText: 'Вопрос')),
            TextField(controller: first, decoration: const InputDecoration(labelText: 'Вариант 1')),
            TextField(controller: second, decoration: const InputDecoration(labelText: 'Вариант 2')),
            TextField(controller: extra, decoration: const InputDecoration(labelText: 'Вариант 3, если нужен')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Отправить')),
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    }
  }

  Future<void> _vote(String messageId, int index) async {
    try {
      await _api.votePoll(messageId, [index]);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionController>().user?.id;
    final origin = context.watch<SessionController>().apiOrigin;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Позвонить',
            onPressed: () => pushPage(
              context,
              CallPage(
                conversationId: widget.conversationId,
                recipientId: widget.otherMemberId,
                title: widget.title,
              ),
            ),
            icon: const Icon(Icons.call),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: ListView.builder(
                reverse: true,
                padding: const EdgeInsets.all(12),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final message = asMap(_messages[index]);
                  final mine = asInt(message['sender_id']) == me;
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
                      decoration: BoxDecoration(
                        color: mine
                            ? Theme.of(context).colorScheme.primaryContainer
                            : Theme.of(context).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: _MessageBody(
                        message: message,
                        origin: origin,
                        onVote: (index) => _vote(str(message['id']), index),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
              child: Row(
                children: [
                  IconButton(onPressed: _sending ? null : _pickImage, icon: const Icon(Icons.image_outlined)),
                  IconButton(onPressed: _sending ? null : _pickFile, icon: const Icon(Icons.attach_file)),
                  IconButton(onPressed: _sending ? null : _poll, icon: const Icon(Icons.poll_outlined)),
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(hintText: 'Сообщение'),
                    ),
                  ),
                  IconButton(
                    onPressed: _sending ? null : _toggleRecord,
                    icon: Icon(_recording ? Icons.stop_circle : Icons.mic_none),
                  ),
                  IconButton(onPressed: _sending ? null : _sendText, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({required this.message, required this.origin, required this.onVote});
  final Map<String, dynamic> message;
  final String origin;
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
          Image.network(url, width: 220, fit: BoxFit.cover),
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
            const Icon(Icons.play_circle_fill),
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
            const Icon(Icons.insert_drive_file_outlined),
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
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(caption, style: const TextStyle(fontWeight: FontWeight.w700)),
          for (var i = 0; i < options.length; i++)
            TextButton(
              onPressed: () => onVote(i),
              child: Text('${str(options[i])} · ${i < tallies.length ? asInt(tallies[i]) : 0}'),
            ),
        ],
      );
    }
    return Text(caption);
  }
}
