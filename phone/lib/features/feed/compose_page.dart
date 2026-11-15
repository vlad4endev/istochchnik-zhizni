import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/session.dart';

class ComposePage extends StatefulWidget {
  const ComposePage({super.key, this.story = false});
  final bool story;

  @override
  State<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends State<ComposePage> {
  final _caption = TextEditingController();
  XFile? _file;
  bool _busy = false;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final picker = ImagePicker();
    final XFile? file;
    if (widget.story && source == ImageSource.camera) {
      file = await picker.pickVideo(source: source);
    } else if (widget.story) {
      file = await picker.pickMedia();
    } else {
      file = await picker.pickImage(source: source, imageQuality: 85);
    }
    if (file != null) setState(() => _file = file);
  }

  Future<void> _send() async {
    final caption = _caption.text.trim();
    if (widget.story && _file == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Для сторис нужен снимок или видео')));
      return;
    }
    if (!widget.story && caption.isEmpty && _file == null) return;
    setState(() => _busy = true);
    final api = ChurchApi(context.read<SessionController>());
    try {
      if (widget.story) {
        await api.createStory(filePath: _file!.path, fileName: _file!.name, caption: caption);
      } else {
        await api.createPost(caption: caption, filePath: _file?.path, fileName: _file?.name);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeDio(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.story ? 'Сторис' : 'Запись')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _caption,
            minLines: 3,
            maxLines: 6,
            decoration: InputDecoration(labelText: widget.story ? 'Подпись' : 'Текст'),
          ),
          const SizedBox(height: 12),
          if (_file != null) Text(_file!.name),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () => _pick(ImageSource.gallery), child: const Text('Выбрать из галереи')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () => _pick(ImageSource.camera), child: const Text('Снять камерой')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Отправка…' : 'Опубликовать')),
        ],
      ),
    );
  }
}
