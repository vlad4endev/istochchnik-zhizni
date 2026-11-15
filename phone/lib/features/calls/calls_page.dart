import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class CallsPage extends StatefulWidget {
  const CallsPage({super.key});

  @override
  State<CallsPage> createState() => _CallsPageState();
}

class _CallsPageState extends State<CallsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ChurchApi(context.read<SessionController>()).calls();
      if (!mounted) return;
      setState(() {
        _items = asList(data['items']);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  (String, Tone) _status(String status) => switch (status) {
        'missed' => ('Пропущен', Tone.red),
        'declined' => ('Отклонён', Tone.red),
        'ended' || 'completed' => ('Завершён', Tone.neutral),
        'active' || 'ongoing' => ('Идёт', Tone.green),
        'ringing' => ('Вызов', Tone.amber),
        _ => (status, Tone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    return ChurchPage(
      title: 'Звонки',
      subtitle: 'Журнал звонков',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: _items.isEmpty
            ? const EmptyHint('Звонков пока нет', icon: Icons.call_outlined, hint: 'Позвонить можно из любого чата — кнопка с трубкой вверху.')
            : SheetList(
                onRefresh: _load,
                children: [
                  ListGroup(
                    children: [
                      for (final raw in _items)
                        Builder(builder: (context) {
                          final item = asMap(raw);
                          final video = str(item['call_type']) == 'video';
                          final (label, tone) = _status(str(item['status']));
                          return ListRow(
                            leading: IconTile(video ? Icons.videocam_outlined : Icons.call_outlined, tone: tone == Tone.red ? Tone.red : Tone.violet),
                            title: str(item['title']).isEmpty ? 'Звонок' : str(item['title']),
                            subtitle: [video ? 'Видеозвонок' : 'Аудиозвонок', relativeTime(item['created_at'])]
                                .where((part) => part.isNotEmpty)
                                .join(' · '),
                            trailing: label.isEmpty ? null : StatusPill(label, tone: tone),
                          );
                        }),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}
