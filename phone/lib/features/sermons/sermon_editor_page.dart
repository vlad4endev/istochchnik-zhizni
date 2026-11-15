import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

/// Конспект проповеди: заголовок крупным курсивом, место Писания и текст.
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
    if (_busy) return;
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
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  InputDecoration _bare(String hint) => InputDecoration(
        hintText: hint,
        filled: false,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        contentPadding: EdgeInsets.zero,
      );

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return ChurchPage(
      title: widget.note == null ? 'Новый конспект' : 'Конспект',
      subtitle: 'Виден только вам',
      actions: [
        HeaderButton(icon: Icons.check_rounded, tooltip: 'Сохранить', accent: true, onPressed: _busy ? null : _save),
      ],
      body: SheetList(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 32),
        children: [
          TextField(
            controller: _title,
            maxLines: null,
            textCapitalization: TextCapitalization.sentences,
            style: ChurchType.serifTitle.copyWith(fontSize: 26, color: palette.ink),
            decoration: _bare('Название проповеди').copyWith(
              hintStyle: ChurchType.serifTitle.copyWith(fontSize: 26, color: palette.chevron),
            ),
          ),
          Row(
            children: [
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: palette.card,
                    borderRadius: BorderRadius.circular(Radii.sm),
                    border: Border.all(color: palette.outline),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.menu_book_outlined, size: 16, color: palette.accent),
                      const SizedBox(width: 6),
                      Flexible(
                        child: IntrinsicWidth(
                          child: TextField(
                            controller: _scripture,
                            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: palette.accent),
                            decoration: _bare('Место Писания').copyWith(isDense: true),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          LabeledField(label: 'Тема', controller: _topic, hint: 'О чём проповедь', textCapitalization: TextCapitalization.sentences),
          ChurchCard(
            child: TextField(
              controller: _body,
              minLines: 10,
              maxLines: null,
              textCapitalization: TextCapitalization.sentences,
              style: ChurchType.body.copyWith(fontSize: 16, height: 1.55, color: palette.ink),
              decoration: _bare('Текст конспекта: тезисы, стихи, иллюстрации…'),
            ),
          ),
          PrimaryButton(label: 'Сохранить конспект', icon: Icons.check_rounded, busy: _busy, onPressed: _save),
        ],
      ),
    );
  }
}
