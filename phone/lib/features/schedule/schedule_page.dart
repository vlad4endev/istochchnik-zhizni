import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key});

  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> {
  bool _loading = true;
  String? _mediaError;
  String? _musicError;
  List<dynamic> _media = const [];
  List<dynamic> _music = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ChurchApi(context.read<SessionController>());
    final now = DateTime.now();
    final end = now.add(const Duration(days: 21));
    String ymd(DateTime date) =>
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    setState(() => _loading = true);
    try {
      _media = await api.mediaMine(ymd(now), ymd(end));
      _mediaError = null;
    } catch (error) {
      _media = const [];
      _mediaError = describeDio(error);
    }
    try {
      _music = await api.musicMine(ymd(now), ymd(end));
      _musicError = null;
    } catch (error) {
      _music = const [];
      _musicError = describeDio(error);
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Расписание'),
          bottom: const TabBar(tabs: [Tab(text: 'Медиа'), Tab(text: 'Музыка')]),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  _List(items: _media, error: _mediaError),
                  _List(items: _music, error: _musicError),
                ],
              ),
      ),
    );
  }
}

class _List extends StatelessWidget {
  const _List({required this.items, required this.error});
  final List<dynamic> items;
  final String? error;

  @override
  Widget build(BuildContext context) {
    if (error != null && items.isEmpty) return EmptyHint(error!);
    if (items.isEmpty) return const EmptyHint('На ближайшие три недели назначений нет');
    return ListView(
      children: [
        for (final raw in items)
          ListTile(
            title: Text(str(asMap(raw)['title']).isEmpty ? str(asMap(raw)['event_date']) : str(asMap(raw)['title'])),
            subtitle: Text(_subtitle(asMap(raw))),
          ),
      ],
    );
  }

  String _subtitle(Map<String, dynamic> event) {
    final assignments = asList(event['assignments']);
    if (assignments.isEmpty) return '${str(event['event_date'])} ${str(event['start_time'])}';
    return assignments.map((raw) {
      final item = asMap(raw);
      final role = str(asMap(item['role'])['name']);
      final status = str(item['status']);
      return [role, status].where((part) => part.isNotEmpty).join(' · ');
    }).join('\n');
  }
}
