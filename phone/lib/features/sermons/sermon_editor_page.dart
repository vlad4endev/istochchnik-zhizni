import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';

class SermonEditorPage extends StatefulWidget {
  const SermonEditorPage({super.key, this.note});
  final Map<String, dynamic>? note;

  @override
  State<SermonEditorPage> createState() => _SermonEditorPageState();
}

class _SermonEditorPageState extends State<SermonEditorPage> {
  late final TextEditingController _title;
  late final TextEditingController _topic;
  late final TextEditingController _scripture;
  late final TextEditingController _body;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final note = widget.note ?? const {};
    _title = TextEditingController(text: str(note['title']));
    _topic = TextEditingController(text: str(note['topic']));
    _scripture = TextEditingController(text: str(note['scripture']));
    _body = TextEditingController(text: str(note['body']));
  }

  @override
  void dispose() {
    _title.dispose();
    _topic.dispose();
    _scripture.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ChurchApi(context.read<SessionController>()).saveSermonNote(
        id: widget.note == null ? null : str(widget.note!['id']),
        title: _title.text.trim(),
        topic: _topic.text.trim(),
        scripture: _scripture.text.trim(),
        body: _body.text,
      );
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
      appBar: AppBar(title: Text(widget.note == null ? 'Новый конспект' : 'Конспект')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _title, decoration: const InputDecoration(labelText: 'Название')),
          const SizedBox(height: 12),
          TextField(controller: _topic, decoration: const InputDecoration(labelText: 'Тема')),
          const SizedBox(height: 12),
          TextField(controller: _scripture, decoration: const InputDecoration(labelText: 'Писание')),
          const SizedBox(height: 12),
          TextField(controller: _body, minLines: 8, maxLines: 16, decoration: const InputDecoration(labelText: 'Текст')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Сохранить')),
        ],
      ),
    );
  }
}
