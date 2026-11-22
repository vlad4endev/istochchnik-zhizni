import 'package:material_ui/material_ui.dart';

import '../../../../core/json.dart';
import '../../../../ui/kit/kit.dart';
import '../../../prayer/widgets/sheet_frame.dart';
import '../../../schedule/models/schedule_models.dart' show PersonRef;
import '../../../schedule/widgets/person_picker.dart';
import '../data/editor_source.dart';
import '../logic/editor_logic.dart';
import '../models/editor_models.dart';
import 'block_style.dart';
import 'song_picker_sheet.dart';

/// Редактирование блока. Возвращает изменённый блок или null (отмена).
Future<EditorBlock?> showBlockEditor(
  BuildContext context, {
  required EditorBlock block,
  required List<BlockType> types,
  required List<Member> members,
  required PlanDraft plan,
  required Future<List<SongChoice>?> Function() loadSongs,
  bool forTemplate = false,
}) {
  return showPrayerSheet<EditorBlock>(
    context,
    title: block.isSeparator ? (forTemplate ? 'Раздел шаблона' : 'Раздел программы') : (forTemplate ? 'Блок шаблона' : 'Блок программы'),
    subtitle: 'Нажмите «Готово» — изменения сохранятся',
    builder: (_) => BlockEditorForm(block: block, types: types, members: members, plan: plan, loadSongs: loadSongs, forTemplate: forTemplate),
  );
}

class BlockEditorForm extends StatefulWidget {
  const BlockEditorForm({super.key, required this.block, required this.types, required this.members, required this.plan, required this.loadSongs, this.forTemplate = false});

  final EditorBlock block;
  final List<BlockType> types;
  final List<Member> members;
  final PlanDraft plan;
  final Future<List<SongChoice>?> Function() loadSongs;

  /// Шаблон: ответственный и песня — «по умолчанию», без привязки к проповеднику программы.
  final bool forTemplate;

  @override
  State<BlockEditorForm> createState() => _BlockEditorFormState();
}

class _BlockEditorFormState extends State<BlockEditorForm> {
  late EditorBlock _b = widget.block;
  late final _title = TextEditingController(text: widget.block.isSeparator ? widget.block.separatorLabel : widget.block.title);
  late final _minutes = TextEditingController(text: '${widget.block.minutes}');
  late final _topic = TextEditingController(text: str(widget.block.content['sermon_topic']));
  late final _scripture = TextEditingController(text: str(widget.block.content['sermon_scripture']));
  late final _author = TextEditingController(text: str(widget.block.content['poem_author']));
  late final _theme = TextEditingController(text: str(widget.block.content['poem_theme']));
  late final _text = TextEditingController(text: str(widget.block.content['text']));
  late final _mark = TextEditingController(text: str(widget.block.content['block_mark']));
  late final _logo = TextEditingController(text: str(widget.block.content['block_logo_url']));
  String? _songTitle;

  Map<int, Member> get _membersById => {for (final m in widget.members) m.id: m};
  Map<int, BlockType> get _typesById => {for (final t in widget.types) t.id: t};
  BlockType? get _type => _typesById[_b.typeId];

  @override
  void dispose() {
    for (final c in [_title, _minutes, _topic, _scripture, _author, _theme, _text, _mark, _logo]) {
      c.dispose();
    }
    super.dispose();
  }

  void _content(String key, Object? value) {
    final next = {..._b.content};
    if (value == null || (value is String && value.isEmpty)) {
      next.remove(key);
    } else {
      next[key] = value;
    }
    setState(() => _b = _b.copyWith(content: next));
  }

  String get _preacherName => _membersById[widget.plan.preacherId]?.name ?? 'Проповедник';

  void _onTopic(String value) {
    final topic = value.trim();
    final next = {..._b.content};
    if (topic.isEmpty) {
      next.remove('sermon_topic');
    } else {
      next['sermon_topic'] = topic;
    }
    final title = topic.isEmpty ? _preacherName : '$_preacherName - $topic';
    setState(() => _b = _b.copyWith(content: next, title: title));
    _title.text = title;
  }

  void _changeType(int id) {
    final type = _typesById[id];
    var next = _b.copyWith(typeId: id);
    if (type != null && !widget.forTemplate) {
      if (type.isBirthdays) next = next.copyWith(title: 'Дни рождения недели');
      if (type.isSermon) {
        final topic = str(next.content['sermon_topic']).trim();
        next = next.copyWith(assignedId: widget.plan.preacherId, title: topic.isEmpty ? _preacherName : '$_preacherName - $topic');
      }
      if (type.isSong) next = next.copyWith(assignedId: widget.plan.musicId);
    }
    setState(() => _b = next);
    _title.text = next.title;
  }

  Future<void> _pickResponsible() async {
    final people = [for (final m in widget.members) PersonRef(id: m.id, name: m.name, ministryRole: m.ministryRole, ministryDirection: m.ministryDirection)];
    final current = _membersById[_b.assignedId];
    await showPersonPicker(
      context,
      title: 'Ответственный',
      subtitle: 'Кто ведёт этот блок',
      load: (_) async => people,
      offerEveryone: false,
      current: current == null ? null : PersonRef(id: current.id, name: current.name),
      clearLabel: 'Снять',
      onClear: () async => setState(() => _b = _b.copyWith(assignedId: null)),
      onPick: (p) async {
        var next = _b.copyWith(assignedId: p.id);
        if (_type?.isPoem == true && !widget.forTemplate) next = next.copyWith(title: 'СТИХ - ${p.name}');
        setState(() => _b = next);
        if (_type?.isPoem == true && !widget.forTemplate) _title.text = next.title;
      },
    );
  }

  Future<void> _pickSong() async {
    final songs = await widget.loadSongs();
    if (!mounted) return;
    final pick = await showSongPicker(context, songs: songs, currentId: _b.songId);
    if (pick == null) return;
    final song = pick.song;
    setState(() {
      if (song == null) {
        _b = _b.copyWith(songId: null);
        _songTitle = null;
      } else {
        _b = _b.copyWith(songId: song.id, title: songBlockTitle(song.title, song.key));
        _songTitle = _b.title;
        _title.text = _b.title;
      }
    });
  }

  void _save() {
    var out = _b;
    final minutes = parseMinutes(_minutes.text, fallback: _b.minutes);
    if (out.isSeparator) {
      final text = _title.text.trim();
      out = out.copyWith(title: text.isEmpty ? 'Раздел' : text, minutes: out.minutes, content: {...out.content, 'separator_text': text.isEmpty ? 'Раздел' : text});
    } else {
      out = out.copyWith(title: _title.text.trim().isEmpty ? 'Блок' : _title.text.trim(), minutes: minutes);
    }
    Navigator.of(context).pop(out);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final type = _type;
    final sep = _b.isSeparator;
    final auto = !widget.forTemplate && (type?.isSermon == true || type?.isSong == true);
    final responsible = _membersById[_b.assignedId]?.name;
    final autoHint = type?.isSermon == true
        ? (widget.plan.preacherId == null ? 'В настройках программы не выбран проповедник' : _preacherName)
        : (widget.plan.musicId == null ? 'В настройках программы не выбран ответственный за музыку' : (_membersById[widget.plan.musicId]?.name ?? 'Музыкальное служение'));
    return Material(
      type: MaterialType.transparency,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          LabeledField(key: const ValueKey('block-title'), label: sep ? 'Текст разделителя' : 'Название блока', controller: _title, textInputAction: TextInputAction.next, textCapitalization: TextCapitalization.sentences),
          if (!sep) ...[
            const SizedBox(height: 12),
            _FieldLabel('Тип блока'),
            DropdownButtonFormField<int>(
              key: const ValueKey('block-type'),
              initialValue: widget.types.any((t) => t.id == _b.typeId) ? _b.typeId : null,
              isExpanded: true,
              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
              items: [for (final t in widget.types) DropdownMenuItem(value: t.id, child: Text(t.name, overflow: TextOverflow.ellipsis))],
              onChanged: (v) {
                if (v != null) _changeType(v);
              },
            ),
            const SizedBox(height: 12),
            LabeledField(key: const ValueKey('block-minutes'), label: 'Длительность, мин', controller: _minutes, keyboardType: TextInputType.number),
            const SizedBox(height: 12),
            _FieldLabel(widget.forTemplate ? 'Ответственный по умолчанию' : (type?.isPoem == true ? 'Чтец' : 'Ответственный')),
            ListGroup(
              dividerIndent: 14,
              children: [
                ListRow(
                  key: const ValueKey('block-responsible'),
                  leading: const IconTile(Icons.person_outline_rounded, tone: Tone.violet, size: 36),
                  title: auto ? autoHint : (responsible ?? (widget.forTemplate ? 'Не назначен по умолчанию' : (type?.isPoem == true ? 'Чтец не назначен' : 'Не назначен'))),
                  subtitle: auto ? 'Назначается автоматически из настроек программы' : null,
                  chevron: !auto,
                  onTap: auto ? null : _pickResponsible,
                ),
              ],
            ),
            if (type?.isSong == true) ...[
              const SizedBox(height: 12),
              _FieldLabel('Песня'),
              ListGroup(
                dividerIndent: 14,
                children: [
                  ListRow(
                    key: const ValueKey('block-song'),
                    leading: const IconTile(Icons.music_note_rounded, tone: Tone.teal, size: 36),
                    title: _b.songId == null ? 'Выбрать песню' : (_songTitle ?? _b.title),
                    subtitle: _b.songId == null ? 'Из каталога песен' : 'Нажмите, чтобы заменить',
                    onTap: _pickSong,
                  ),
                ],
              ),
            ],
            if (type?.isSermon == true && !widget.forTemplate) ...[
              const SizedBox(height: 12),
              LabeledField(key: const ValueKey('block-topic'), label: 'Тема проповеди', controller: _topic, onChanged: _onTopic),
              const SizedBox(height: 12),
              LabeledField(key: const ValueKey('block-scripture'), label: 'Стихи из Библии', controller: _scripture, onChanged: (v) => _content('sermon_scripture', v.trim())),
            ],
            if (type?.isPoem == true && !widget.forTemplate) ...[
              const SizedBox(height: 12),
              LabeledField(label: 'Автор стиха', controller: _author, onChanged: (v) => _content('poem_author', v.trim())),
              const SizedBox(height: 12),
              LabeledField(label: 'Тема стиха', controller: _theme, onChanged: (v) => _content('poem_theme', v.trim())),
            ],
            if (!auto && type?.isPoem != true) ...[
              const SizedBox(height: 12),
              LabeledField(key: const ValueKey('block-text'), label: 'Текст заметок', controller: _text, minLines: 2, maxLines: 6, onChanged: (v) => _content('text', v)),
            ],
            const SizedBox(height: 16),
            _FieldLabel('Метка и значок'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (key, label) in blockMarkOptions)
                  ChoiceChip(
                    key: ValueKey('mark-$key'),
                    avatar: Icon(blockLook(key).$1, size: 18),
                    label: Text(label),
                    selected: str(_b.content['block_mark_icon']) == key,
                    onSelected: (on) => _content('block_mark_icon', on ? key : null),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            LabeledField(label: 'Маркер (короткая подпись)', controller: _mark, onChanged: (v) => _content('block_mark', v.trim())),
            const SizedBox(height: 12),
            LabeledField(label: 'Ссылка на изображение значка', controller: _logo, keyboardType: TextInputType.url, hint: 'https://…', onChanged: (v) => _content('block_logo_url', v.trim())),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: palette.card, borderRadius: BorderRadius.circular(Radii.lg), border: Border.all(color: palette.hairline)),
              child: Material(
                type: MaterialType.transparency,
                child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Сцена перед блоком', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: palette.inkMuted)),
                  Text('Можно выбрать только один вариант — он появится в итоговой программе.', style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
                  SwitchListTile(
                    key: const ValueKey('stage-remove'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Убираем стойки и пюпитры'),
                    value: stageRemoveOn(_b.content),
                    onChanged: (v) => setState(() => _b = _b.copyWith(content: setStageRemove(_b.content, v))),
                  ),
                  SwitchListTile(
                    key: const ValueKey('stage-place'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Выставляем микрофоны и пюпитры'),
                    value: stagePlaceOn(_b.content),
                    onChanged: (v) => setState(() => _b = _b.copyWith(content: setStagePlace(_b.content, v))),
                  ),
                ],
              )),
            ),
          ],
          if (!widget.forTemplate)
          SwitchListTile(
            key: const ValueKey('block-hidden'),
            contentPadding: EdgeInsets.zero,
            title: const Text('Скрыть в публикации'),
            subtitle: const Text('Блок остаётся в плане, но не виден по общей ссылке'),
            value: _b.isHidden,
            onChanged: (v) => _content('hide_in_public', v ? true : null),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: SecondaryButton(label: 'Отмена', onPressed: () => Navigator.of(context).pop())),
              const SizedBox(width: 12),
              Expanded(child: PrimaryButton(key: const ValueKey('block-save'), label: 'Готово', onPressed: _save)),
            ],
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: context.palette.inkMuted)),
      );
}
