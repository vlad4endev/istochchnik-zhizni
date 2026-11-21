import 'package:material_ui/material_ui.dart';

import '../../../core/json.dart';
import '../../../ui/kit/kit.dart';
import '../../prayer/widgets/sheet_frame.dart';
import '../data/chat_source.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';

/// Название чата в списке: заголовок группы или имя собеседника.
String conversationTitle(Map<String, dynamic> item) {
  final title = str(item['title']).trim();
  if (title.isNotEmpty) return title;
  final other = str(asMap(item['other_member'])['name']).trim();
  return other.isEmpty ? 'Чат' : other;
}

/// Куда переслать сообщение: список чатов с поиском и галочками. Возвращает выбранные id.
Future<List<String>?> showForwardSheet(BuildContext context, ChatSource source, {required String excludeId}) {
  return showPrayerSheet<List<String>>(
    context,
    title: 'Переслать',
    builder: (sheet) => _ForwardList(source: source, excludeId: excludeId),
  );
}

class _ForwardList extends StatefulWidget {
  const _ForwardList({required this.source, required this.excludeId});
  final ChatSource source;
  final String excludeId;

  @override
  State<_ForwardList> createState() => _ForwardListState();
}

class _ForwardListState extends State<_ForwardList> {
  List<Map<String, dynamic>>? _items;
  String? _error;
  final _selected = <String>{};
  final _query = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final items = await widget.source.conversations();
      if (mounted) setState(() => _items = items);
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось загрузить чаты. Проверьте интернет.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (_error != null) {
      return Column(children: [
        InfoBanner(_error!, error: true),
        const SizedBox(height: 8),
        SecondaryButton(label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _load),
      ]);
    }
    final items = _items;
    if (items == null) return const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: CircularProgressIndicator()));
    final needle = _query.text.trim().toLowerCase();
    final shown = [
      for (final i in items)
        if (str(i['id']) != widget.excludeId && (needle.isEmpty || conversationTitle(i).toLowerCase().contains(needle))) i,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChurchSearchField(controller: _query, hint: 'Найти чат', onChanged: (_) => setState(() {})),
        const SizedBox(height: 8),
        if (shown.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text('Чатов не найдено.', textAlign: TextAlign.center, style: TextStyle(color: palette.inkMuted))),
        for (final item in shown)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.trailing,
            secondary: ChurchAvatar(name: conversationTitle(item), imageUrl: null, size: 40),
            title: Text(conversationTitle(item), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: palette.ink)),
            subtitle: Text(switch (str(item['type'])) { 'group' => 'Группа', 'channel' => 'Канал', _ => 'Личный чат' }, style: TextStyle(color: palette.inkMuted)),
            value: _selected.contains(str(item['id'])),
            onChanged: (v) => setState(() => v == true ? _selected.add(str(item['id'])) : _selected.remove(str(item['id']))),
          ),
        const SizedBox(height: 12),
        PrimaryButton(
          label: _selected.isEmpty ? 'Выберите чат' : 'Переслать (${_selected.length})',
          icon: Icons.send_rounded,
          onPressed: _selected.isEmpty ? null : () => Navigator.pop(context, _selected.toList()),
        ),
      ],
    );
  }
}

/// Кто прочитал сообщение (только автору, в группе).
Future<void> showReadersSheet(BuildContext context, ChatSource source, String messageId) {
  return showPrayerSheet<void>(
    context,
    title: 'Кто прочитал',
    builder: (sheet) => FutureBuilder<Readers>(
      future: source.readers(messageId),
      builder: (context, snap) {
        final palette = context.palette;
        if (snap.hasError) return const InfoBanner('Не удалось загрузить список. Попробуйте позже.', error: true);
        final data = snap.data;
        if (data == null) return const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: CircularProgressIndicator()));
        if (data.readers.isEmpty) {
          return Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text('Пока никто не прочитал.', textAlign: TextAlign.center, style: TextStyle(color: palette.inkMuted)));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Прочитали ${data.readers.length}${data.otherCount > 0 ? ' из ${data.otherCount}' : ''}', style: TextStyle(fontWeight: FontWeight.w700, color: palette.inkMuted)),
            ),
            for (final r in data.readers)
              ListRow(
                leading: ChurchAvatar(name: r.name.isEmpty ? '?' : r.name, imageUrl: r.avatarUrl, size: 40),
                title: r.name.isEmpty ? 'Участник' : r.name,
                subtitle: r.readAt == null ? null : _readAt(r.readAt!),
                chevron: false,
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
          ],
        );
      },
    ),
  );
}

String _readAt(DateTime at) => 'прочитано ${dayLabel(at, DateTime.now()).toLowerCase()} в ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
