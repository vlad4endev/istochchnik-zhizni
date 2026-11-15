import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/widgets.dart';

class PrayerPage extends StatefulWidget {
  const PrayerPage({super.key});

  @override
  State<PrayerPage> createState() => _PrayerPageState();
}

class _PrayerPageState extends State<PrayerPage> {
  DateTime _date = DateTime.now();
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _day = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _iso {
    final utc = DateTime.utc(_date.year, _date.month, _date.day);
    return '${utc.year.toString().padLeft(4, '0')}-${utc.month.toString().padLeft(2, '0')}-${utc.day.toString().padLeft(2, '0')}';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final day = await ChurchApi(context.read<SessionController>()).day(_iso);
      if (!mounted) return;
      setState(() {
        _day = day;
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

  void _shift(int days) {
    setState(() => _date = _date.add(Duration(days: days)));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final members = asList(_day['members']);
    final themes = asList(_day['global_themes']);
    final ministries = asList(_day['ministries']);
    return Scaffold(
      appBar: AppBar(title: const Text('Молитва')),
      body: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left)),
              Text(_iso, style: Theme.of(context).textTheme.titleMedium),
              IconButton(onPressed: () => _shift(1), icon: const Icon(Icons.chevron_right)),
            ],
          ),
          Expanded(
            child: AsyncBody(
              loading: _loading,
              error: _error,
              onRetry: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final raw in members) _Block('Член церкви', asMap(raw), 'name', 'prayer_request'),
                  for (final raw in themes) _Block('Тема дня', asMap(raw), 'title', 'prayer_points'),
                  for (final raw in ministries) _Block('Служение', asMap(raw), 'title', 'prayer_points'),
                  if (members.isEmpty && themes.isEmpty) const EmptyHint('На эту дату записей нет'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block(this.label, this.data, this.titleKey, this.bodyKey);
  final String label;
  final Map<String, dynamic> data;
  final String titleKey;
  final String bodyKey;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(str(data[titleKey]).isEmpty ? 'Не указано' : str(data[titleKey]), style: Theme.of(context).textTheme.titleMedium),
            if (str(data[bodyKey]).isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(str(data[bodyKey])),
            ],
            if (str(data['bible_verse']).isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(str(data['bible_verse'])),
            ],
          ],
        ),
      ),
    );
  }
}
